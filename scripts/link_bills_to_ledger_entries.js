/**
 * link_bills_to_ledger_entries.js
 *
 * Fast and safe linker for legacy bill ledger entries.
 * Uses indexed `transactionId` (Zoho Bill ID) from `bill.notes` and description matching.
 * Validates double-entry balancing and compares totals against bill amounts.
 * Flags any anomalies for user inspection.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const xlsx = require('xlsx');

const Bill = require('../Src/modules/Bill/Model/BillModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

const excelPath = path.join(__dirname, 'dontChnageBillTax.xlsx');

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function run() {
    try {
        console.log('===============================================================');
        console.log('  LINK BILLS TO EXISTING UNLINKED LEDGER ENTRIES');
        console.log('===============================================================');
        console.log(`Mode:       ${isExecute ? '⚡ LIVE EXECUTION (Linking entries)' : '🔍 DRY RUN (Preview only)'}`);
        console.log(`Excel file: ${excelPath}`);

        if (!fs.existsSync(excelPath)) {
            throw new Error(`File not found: ${excelPath}`);
        }

        const wb = xlsx.readFile(excelPath);
        const sheet = wb.Sheets['BillsTemplate'] || wb.Sheets[wb.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(sheet);

        const billNumbers = [];
        const seen = new Set();
        for (const row of rows) {
            const raw = row['Bill Number'] || row['billNumber'] || row['BillNo'] || row['bill_number'];
            if (raw) {
                const bNum = String(raw).trim();
                if (!seen.has(bNum.toUpperCase())) {
                    seen.add(bNum.toUpperCase());
                    billNumbers.push(bNum);
                }
            }
        }
        console.log(`Total unique bill numbers in Excel: ${billNumbers.length}`);

        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.\n');

        // Fetch all matching bills in one query
        console.log('Fetching bills from database...');
        const bills = await Bill.find({
            billNumber: { $in: billNumbers },
            isDeleted: { $ne: true }
        }).lean();

        console.log(`Matched ${bills.length} bills in DB (out of ${billNumbers.length}).`);

        // Check if any bill numbers in Excel were not found by exact match
        const foundBillNumSet = new Set(bills.map(b => b.billNumber.toUpperCase()));
        const missingBillNumbers = billNumbers.filter(b => !foundBillNumSet.has(b.toUpperCase()));

        // Map bills and collect Zoho Transaction IDs
        const txIdToBillMap = new Map();
        const billNumToBillMap = new Map();
        const txIds = [];

        for (const b of bills) {
            billNumToBillMap.set(b.billNumber.toUpperCase(), b);
            const m = (b.notes || '').match(/Bill ID:\s*(\d+)/i);
            if (m) {
                const txId = m[1].trim();
                txIdToBillMap.set(txId, b);
                txIds.push(txId);
            }
        }

        console.log(`Bills with Zoho Transaction ID in notes: ${txIds.length}`);

        // Fetch ledger entries by indexed transactionId
        console.log('Fetching ledger entries using indexed transactionId...');
        const entriesByTxId = await LedgerEntry.find({
            transactionId: { $in: txIds },
            isDeleted: { $ne: true }
        }).lean();
        console.log(`Found ${entriesByTxId.length} ledger entries matching Zoho Transaction IDs.`);

        // Group entries by transactionId
        const txIdToEntries = new Map();
        for (const entry of entriesByTxId) {
            const txId = entry.transactionId;
            if (!txIdToEntries.has(txId)) {
                txIdToEntries.set(txId, []);
            }
            txIdToEntries.get(txId).push(entry);
        }

        const anomalies = [];
        const toLink = [];
        const alreadyLinked = [];

        if (missingBillNumbers.length > 0) {
            for (const mb of missingBillNumbers) {
                anomalies.push({
                    billNumber: mb,
                    type: 'BILL_NOT_FOUND',
                    message: 'Bill number from Excel not found in MongoDB.'
                });
            }
        }

        for (const bill of bills) {
            const m = (bill.notes || '').match(/Bill ID:\s*(\d+)/i);
            const txId = m ? m[1].trim() : null;

            let candidateEntries = [];
            if (txId && txIdToEntries.has(txId)) {
                candidateEntries = txIdToEntries.get(txId);
            } else {
                // Fallback query for this specific bill
                const escaped = escapeRegex(bill.billNumber);
                candidateEntries = await LedgerEntry.find({
                    $or: [
                        { description: new RegExp(`entity_number:\\s*${escaped}(?=[^a-zA-Z0-9_-]|$)`, 'i') },
                        { description: new RegExp(`\\b${escaped}\\b`, 'i') }
                    ],
                    isDeleted: { $ne: true }
                }).lean();
            }

            if (candidateEntries.length === 0) {
                anomalies.push({
                    billNumber: bill.billNumber,
                    billId: bill._id,
                    type: 'NO_ENTRIES_FOUND',
                    message: 'No ledger entries found by transaction ID or description.'
                });
                continue;
            }

            // Check if entries are already linked to this bill
            const unlinked = candidateEntries.filter(e => !e.bill || e.bill.toString() !== bill._id.toString());
            const alreadyLinkedEntries = candidateEntries.filter(e => e.bill && e.bill.toString() === bill._id.toString());

            if (unlinked.length === 0 && alreadyLinkedEntries.length > 0) {
                alreadyLinked.push({
                    billNumber: bill.billNumber,
                    billId: bill._id,
                    billTotal: bill.totalAmount,
                    entryCount: alreadyLinkedEntries.length
                });
                continue;
            }

            // Filter for initial booking entries vs payment entries
            // Booking entries have transactionType 'bill' or description with entity_number
            let debitTotal = 0;
            let creditTotal = 0;
            for (const entry of candidateEntries) {
                if (entry.type === 'DEBIT') debitTotal += (entry.amount || 0);
                if (entry.type === 'CREDIT') creditTotal += (entry.amount || 0);
            }

            debitTotal = Math.round(debitTotal * 100) / 100;
            creditTotal = Math.round(creditTotal * 100) / 100;
            const billTotal = Math.round((bill.totalAmount || 0) * 100) / 100;

            const isBalanced = Math.abs(debitTotal - creditTotal) < 0.05;
            const matchesBillTotal = Math.abs(creditTotal - billTotal) < 0.05 || Math.abs(debitTotal - billTotal) < 0.05;

            if (!isBalanced || !matchesBillTotal) {
                anomalies.push({
                    billNumber: bill.billNumber,
                    billId: bill._id,
                    type: 'AMOUNT_MISMATCH',
                    message: `Debit: $${debitTotal}, Credit: $${creditTotal}, Bill Total: $${billTotal} (Entries: ${candidateEntries.length})`
                });
                continue;
            }

            toLink.push({
                billNumber: bill.billNumber,
                billId: bill._id,
                billTotal,
                entryCount: unlinked.length,
                entryIds: unlinked.map(e => e._id),
                debitTotal,
                creditTotal
            });
        }

        console.log('\n---------------------------------------------------------------');
        console.log('SUMMARY OF FINDINGS:');
        console.log(`  Total Bills in Excel:          ${billNumbers.length}`);
        console.log(`  Bills Found in Database:       ${bills.length}`);
        console.log(`  Already Fully Linked:          ${alreadyLinked.length}`);
        console.log(`  Ready to Link (Clean Matches): ${toLink.length}`);
        console.log(`  Total Entries to Link:         ${toLink.reduce((sum, item) => sum + item.entryCount, 0)}`);
        console.log(`  Anomalies Detected:            ${anomalies.length}`);
        console.log('---------------------------------------------------------------\n');

        if (anomalies.length > 0) {
            console.log('⚠️  ANOMALIES:');
            anomalies.forEach((a, idx) => {
                console.log(`  ${idx + 1}. [${a.type}] Bill: ${a.billNumber} - ${a.message}`);
            });
            console.log('');
        }

        if (toLink.length > 0) {
            console.log('Sample of bills ready to link (first 5):');
            toLink.slice(0, 5).forEach(item => {
                console.log(`  • Bill ${item.billNumber}: Total $${item.billTotal} -> ${item.entryCount} entries (Dr: $${item.debitTotal} / Cr: $${item.creditTotal})`);
            });
            console.log('');
        }

        if (isExecute && toLink.length > 0) {
            console.log('⚡ Executing link updates in database...');
            const bulkOps = [];
            for (const item of toLink) {
                if (item.entryIds.length > 0) {
                    bulkOps.push({
                        updateMany: {
                            filter: { _id: { $in: item.entryIds } },
                            update: { $set: { bill: item.billId } }
                        }
                    });
                }
            }

            if (bulkOps.length > 0) {
                const res = await LedgerEntry.bulkWrite(bulkOps);
                console.log(`✅ Bulk write completed! Modified ${res.modifiedCount} ledger entries.`);
            }
            console.log(`✅ Successfully linked ledger entries for ${toLink.length} bills.`);
        } else if (!isExecute) {
            console.log('ℹ️  DRY RUN complete. No changes made. Pass --execute to link.');
        }

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

run();

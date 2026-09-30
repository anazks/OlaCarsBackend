/**
 * populate_bill_payments_and_link_vp.js
 *
 * Populates payment history for the 272 bills in dontChnageBillTax.xlsx:
 * 1. For all 272 bills: Adds a payment record to `bill.payments`:
 *    - amount: bill.amountPaid (e.g. $22,250, $14,500, etc.)
 *    - paidAt: payment date or billDate
 *    - paymentMethod: "Bank Transfer"
 *    - transactionId: payment txId (if matched) or bill's Zoho ID
 *    - note: custom note explaining settlement method
 * 2. For the 49 bills with direct payment ledger entries (Debit Accounts Payable & Credit Bank/Prepaid):
 *    - Links those payment ledger entries by setting `entry.bill = bill._id`
 *    - Uses their specific payment transactionId
 *    - Makes the payment entries show under "Transaction Entries"
 * 3. For the remaining 223 bills:
 *    - Populates `bill.payments` with "Settled via Fleet Advance / Bulk Bank Disbursement"
 *    - Leaves general ledger balances untouched (prevents double-counting bank outflows)
 *
 * Usage:
 *   node scripts/populate_bill_payments_and_link_vp.js
 *   node scripts/populate_bill_payments_and_link_vp.js --execute
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const xlsx = require('xlsx');

// Ensure all models are registered
require('../Src/modules/Supplier/Model/SupplierModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Branch/Model/BranchModel');
require('../Src/modules/BankAccount/Model/BankAccountModel');
require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/PaymentMade/Model/PaymentMadeModel');
require('../Src/modules/Payment/Model/PaymentTransactionModel');
const Bill = require('../Src/modules/Bill/Model/BillModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function run() {
    try {
        console.log('===============================================================');
        console.log('  POPULATE BILL PAYMENTS & LINK VENDOR PAYMENT ENTRIES');
        console.log('===============================================================');
        console.log(`Mode: ${isExecute ? '⚡ LIVE EXECUTION (Updating DB)' : '🔍 DRY RUN (Preview only)'}`);

        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.\n');

        const excelPath = path.join(__dirname, 'dontChnageBillTax.xlsx');
        const wb = xlsx.readFile(excelPath);
        const sheet = wb.Sheets['BillsTemplate'];
        const rows = xlsx.utils.sheet_to_json(sheet);
        const billNumbers = [...new Set(rows.map(r => String(r['Bill Number'] || '').trim()).filter(Boolean))];

        console.log(`Loaded ${billNumbers.length} unique bill numbers from Excel.`);

        // Fetch bills
        const bills = await Bill.find({ billNumber: { $in: billNumbers }, isDeleted: { $ne: true } });
        console.log(`Matched ${bills.length} bills in MongoDB.\n`);

        // Fetch all vendor_payment ledger entries in one query
        console.log('Scanning vendor_payment ledger entries...');
        const allVPEntries = await LedgerEntry.find({
            transactionType: { $in: ['vendor_payment', 'payment', 'bill_payment'] },
            isDeleted: { $ne: true }
        }).lean();
        console.log(`Found ${allVPEntries.length} vendor_payment entries in DB.\n`);

        // Index vendor payments by entity_number
        const vpByEntityNumber = new Map();
        for (const vp of allVPEntries) {
            const desc = vp.description || '';
            const m = desc.match(/entity_number:\s*([^\|\]]+)/i);
            if (m) {
                const entityNum = m[1].trim().toUpperCase();
                if (!vpByEntityNumber.has(entityNum)) {
                    vpByEntityNumber.set(entityNum, []);
                }
                vpByEntityNumber.get(entityNum).push(vp);
            }
        }

        let directMatchCount = 0;
        let bulkSettlementCount = 0;
        const billsToUpdate = [];
        const paymentEntriesToLink = [];

        for (const bill of bills) {
            const normalized = bill.billNumber.trim().toUpperCase();
            const matchedVPEntries = vpByEntityNumber.get(normalized) || [];

            const billPaidAmount = bill.amountPaid > 0 ? bill.amountPaid : bill.totalAmount;
            const defaultDate = bill.billDate || bill.createdAt || new Date();

            let paymentRecord = null;

            if (matchedVPEntries.length > 0) {
                directMatchCount++;
                // Find AP debit entry to get exact payment date and txId
                const debitEntry = matchedVPEntries.find(e => e.type === 'DEBIT') || matchedVPEntries[0];
                const paymentDate = debitEntry.entryDate || defaultDate;
                const paymentTxId = debitEntry.transactionId || (bill.notes ? (bill.notes.match(/Bill ID:\s*(\d+)/i) || [])[1] : null);

                paymentRecord = {
                    amount: billPaidAmount,
                    paidAt: paymentDate,
                    paymentMethod: 'Bank Transfer',
                    transactionId: paymentTxId || undefined,
                    note: `Paid via Bank Transfer / Vendor Payment (Ref: ${matchedVPEntries.length} GL entries)`
                };

                // Queue all matching VP entries to be linked to this bill
                for (const vpe of matchedVPEntries) {
                    paymentEntriesToLink.push({
                        entryId: vpe._id,
                        billId: bill._id
                    });
                }
            } else {
                bulkSettlementCount++;
                const zohoIdMatch = (bill.notes || '').match(/Bill ID:\s*(\d+)/i);
                const zohoTxId = zohoIdMatch ? zohoIdMatch[1].trim() : undefined;

                paymentRecord = {
                    amount: billPaidAmount,
                    paidAt: defaultDate,
                    paymentMethod: 'Bank Transfer',
                    transactionId: zohoTxId,
                    note: 'Settled via Fleet Advance / Bulk Bank Disbursement'
                };
            }

            billsToUpdate.push({
                bill,
                paymentRecord
            });
        }

        console.log('---------------------------------------------------------------');
        console.log('SUMMARY OF ACTIONS:');
        console.log(`  Total Bills to Update:                     ${billsToUpdate.length}`);
        console.log(`  Bills with Direct Payment GL Entries:      ${directMatchCount}`);
        console.log(`  Direct Payment GL Entries to Link:         ${paymentEntriesToLink.length}`);
        console.log(`  Bills with Bulk / Advance Fleet Settlement: ${bulkSettlementCount}`);
        console.log('---------------------------------------------------------------\n');

        console.log('Sample Updates (First 3 Direct Matches):');
        const sampleDirect = billsToUpdate.filter(b => b.paymentRecord.note.includes('Vendor Payment')).slice(0, 3);
        for (const s of sampleDirect) {
            console.log(`  • Bill ${s.bill.billNumber}: $${s.paymentRecord.amount} on ${s.paymentRecord.paidAt.toISOString().slice(0, 10)} [TxId: ${s.paymentRecord.transactionId}]`);
        }

        console.log('\nSample Updates (First 3 Bulk Fleet Settlements):');
        const sampleBulk = billsToUpdate.filter(b => b.paymentRecord.note.includes('Fleet Advance')).slice(0, 3);
        for (const s of sampleBulk) {
            console.log(`  • Bill ${s.bill.billNumber}: $${s.paymentRecord.amount} on ${s.paymentRecord.paidAt.toISOString().slice(0, 10)} [TxId: ${s.paymentRecord.transactionId}]`);
        }

        if (isExecute) {
            console.log('\n⚡ Applying updates to database...');

            // 1. Update bill.payments
            let updatedBillsCount = 0;
            for (const item of billsToUpdate) {
                // Ensure payments array has the paymentRecord
                item.bill.payments = [item.paymentRecord];
                item.bill.amountPaid = item.paymentRecord.amount;
                item.bill.balanceDue = 0;
                item.bill.status = 'PAID';
                await item.bill.save();
                updatedBillsCount++;
            }
            console.log(`✅ Successfully updated payments array on ${updatedBillsCount} bills.`);

            // 2. Link payment ledger entries
            if (paymentEntriesToLink.length > 0) {
                const bulkLedgerOps = paymentEntriesToLink.map(p => ({
                    updateOne: {
                        filter: { _id: p.entryId },
                        update: { $set: { bill: p.billId } }
                    }
                }));

                const lr = await LedgerEntry.bulkWrite(bulkLedgerOps);
                console.log(`✅ Successfully linked ${lr.modifiedCount} payment ledger entries to their respective bills.`);
            }

            console.log('\n🎉 ALL DONE! Every bill now has a valid Payment History record.');
        } else {
            console.log('\nℹ️  DRY RUN complete. No changes were made to the database.');
            console.log('Pass --execute to apply these changes.');
        }

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

run();

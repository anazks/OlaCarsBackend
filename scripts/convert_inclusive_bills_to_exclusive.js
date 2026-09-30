/**
 * convert_inclusive_bills_to_exclusive.js
 *
 * Script to convert bills mistakenly uploaded with "Inclusive Tax" into "Exclusive Tax".
 *
 * Features:
 * 1. Filter by date: --from-date=16/6/2026 (or 2026-06-16)
 * 2. Date field selector: --date-field=billDate (default) or --date-field=createdAt
 * 3. Exclude list from Excel: --exclude-file=scripts/dontChnageBillTax.xlsx
 * 4. Recalculates:
 *    - itemsSubtotal = sum(quantity * unitPrice)
 *    - taxAmount = itemsSubtotal * (taxPercentage / 100)  [Exclusive formula]
 *    - totalAmount = itemsSubtotal + taxAmount
 *    - balanceDue = max(0, totalAmount - amountPaid)
 *    - status = balanceDue <= 0.009 ? "PAID" : (amountPaid > 0 ? "PARTIALLY_PAID" : "OPEN")
 *    - isInclusiveTax = false
 *    - Updates notes field if it contains "Is Inclusive Tax: true"
 * 5. Updates Ledger Entries:
 *    - Deletes initial bill booking ledger entries (^Bill {billNumber} - )
 *    - Re-posts corrected exclusive ledger entries (full item cost debited to item account,
 *      exclusive tax debited to Input Tax, full total credited to Accounts Payable)
 *    - Keeps payment / advance set-off entries intact
 * 6. Recalculates Accounts:
 *    - Recalculates debitTotal, creditTotal, and currentBalance on all affected AccountingCodes
 *    - Recalculates running balances on any linked BankAccounts
 *
 * Usage:
 *   node scripts/convert_inclusive_bills_to_exclusive.js --from-date=16/6/2026 --exclude-file=scripts/dontChnageBillTax.xlsx
 *   node scripts/convert_inclusive_bills_to_exclusive.js --from-date=16/6/2026 --exclude-file=scripts/dontChnageBillTax.xlsx --execute
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const xlsx = require('xlsx');

const Bill = require('../Src/modules/Bill/Model/BillModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const BillService = require('../Src/modules/Bill/Service/BillService');
const { syncAccountingCodeBalances, recalculateRunningBalances } = require('../Src/modules/BankAccount/Service/BankAccountService');

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const isTodayOnly = args.includes('--today');
const shouldApplyAdvances = args.includes('--apply-advances');

// Parse --from-date (supports DD/MM/YYYY or YYYY-MM-DD)
const fromDateArg = args.find(a => a.startsWith('--from-date='));
let filterFromDate = null;
if (fromDateArg) {
    const rawVal = fromDateArg.split('=')[1].trim();
    if (rawVal.includes('/')) {
        const parts = rawVal.split('/');
        // DD/MM/YYYY
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        filterFromDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    } else {
        filterFromDate = new Date(rawVal + 'T00:00:00.000Z');
    }
}

// Parse --date-field (billDate or createdAt)
const dateFieldArg = args.find(a => a.startsWith('--date-field='));
const dateField = (dateFieldArg ? dateFieldArg.split('=')[1].trim() : 'billDate');

// Parse --exclude-file
const excludeFileArg = args.find(a => a.startsWith('--exclude-file='));
const defaultExcludePath = path.join(__dirname, 'dontChnageBillTax.xlsx');
let excludeFilePath = excludeFileArg ? path.resolve(excludeFileArg.split('=')[1].trim()) : (fs.existsSync(defaultExcludePath) ? defaultExcludePath : null);

// Parse --bill filter
const billFilterArg = args.find(a => a.startsWith('--bill='));
const targetBillNumbers = billFilterArg ? billFilterArg.split('=')[1].split(',').map(s => s.trim().toUpperCase()) : null;

async function run() {
    try {
        console.log('===============================================================');
        console.log('  CONVERT INCLUSIVE TAX BILLS TO TAX EXCLUSIVE');
        console.log('===============================================================');
        console.log(`Mode:            ${isExecute ? '⚡ LIVE EXECUTION (Changes will be saved)' : '🔍 DRY RUN (Preview only, no changes)'}`);
        console.log(`Date Field:      ${dateField}`);
        console.log(`From Date:       ${filterFromDate ? filterFromDate.toISOString().slice(0, 10) : (isTodayOnly ? 'Today' : 'None (all)')}`);
        console.log(`Apply Advances:  ${shouldApplyAdvances ? 'Yes' : 'No'}`);

        // Read exclude list from Excel
        const exemptBillNumbers = new Set();
        if (excludeFilePath && fs.existsSync(excludeFilePath)) {
            console.log(`Exclude File:    ${excludeFilePath}`);
            const wb = xlsx.readFile(excludeFilePath);
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const excelRows = xlsx.utils.sheet_to_json(firstSheet);
            for (const row of excelRows) {
                const bNum = row['Bill Number'] || row['billNumber'] || row['BillNo'] || row['bill_number'];
                if (bNum) {
                    exemptBillNumbers.add(String(bNum).trim().toUpperCase());
                }
            }
            console.log(`Exempt Bills:    ${exemptBillNumbers.size} bills loaded from file`);
        } else {
            console.log(`Exclude File:    None`);
        }

        if (targetBillNumbers) {
            console.log(`Target Bills:    ${targetBillNumbers.join(', ')}`);
        }
        console.log('Connecting to database...');

        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB successfully.\n');

        // Build query
        const query = { isInclusiveTax: true, isDeleted: { $ne: true } };

        if (isTodayOnly) {
            const startOfToday = new Date();
            startOfToday.setUTCHours(0, 0, 0, 0);
            query[dateField] = { $gte: startOfToday };
        } else if (filterFromDate) {
            query[dateField] = { $gte: filterFromDate };
        }

        if (targetBillNumbers && targetBillNumbers.length > 0) {
            query.billNumber = { $in: targetBillNumbers };
        }

        console.log(`Fetching matching inclusive bills...`);
        const allMatchingBills = await Bill.find(query).sort({ [dateField]: 1 });
        console.log(`Found ${allMatchingBills.length} total inclusive bill(s) matching date filter.`);

        // Filter out exemptions
        const billsToProcess = [];
        let skippedExemptCount = 0;

        for (const b of allMatchingBills) {
            const cleanNum = (b.billNumber || '').trim().toUpperCase();
            if (exemptBillNumbers.has(cleanNum)) {
                skippedExemptCount++;
            } else {
                billsToProcess.push(b);
            }
        }

        console.log(`Skipped (in exemption list): ${skippedExemptCount}`);
        console.log(`Bills to convert:            ${billsToProcess.length}\n`);

        if (billsToProcess.length === 0) {
            console.log('No bills to process.');
            return;
        }

        const affectedAccountingCodes = new Set();
        const summaryResults = [];

        // Pre-calculate changes for all bills in memory
        for (const bill of billsToProcess) {
            const items = bill.items || [];
            const itemsSubtotal = items.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)), 0);
            const taxPercentage = Number(bill.taxPercentage) || 0;

            let newTaxAmount = 0;
            let newTotalAmount = itemsSubtotal;

            if (taxPercentage > 0) {
                newTaxAmount = Math.round((itemsSubtotal * (taxPercentage / 100)) * 100) / 100;
                newTotalAmount = Math.round((itemsSubtotal + newTaxAmount) * 100) / 100;
            }

            const currentAmountPaid = Number(bill.amountPaid) || 0;
            const newBalanceDue = Math.max(0, Math.round((newTotalAmount - currentAmountPaid) * 100) / 100);

            let newStatus = "OPEN";
            if (newBalanceDue <= 0.009 && newTotalAmount > 0) {
                newStatus = "PAID";
            } else if (currentAmountPaid > 0) {
                newStatus = "PARTIALLY_PAID";
            }

            for (const it of items) {
                if (it.accountId) affectedAccountingCodes.add(it.accountId.toString());
            }
            if (bill.creditAccountId) {
                affectedAccountingCodes.add(bill.creditAccountId.toString());
            }

            summaryResults.push({
                billNumber: bill.billNumber,
                billDate: bill.billDate ? bill.billDate.toISOString().slice(0, 10) : 'N/A',
                oldTotal: bill.totalAmount,
                newTotal: newTotalAmount,
                oldTax: bill.taxAmount,
                newTax: newTaxAmount,
                amountPaid: currentAmountPaid,
                newBalanceDue,
                oldStatus: bill.status,
                newStatus
            });
        }

        if (isExecute) {
            console.log(`Applying updates in concurrent batches...`);
            const BATCH_SIZE = 15;
            let processed = 0;

            for (let i = 0; i < billsToProcess.length; i += BATCH_SIZE) {
                const batch = billsToProcess.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (bill) => {
                    const matchSummary = summaryResults.find(s => s.billNumber === bill.billNumber);
                    if (!matchSummary) return;

                    const initialBillRegex = new RegExp(`^Bill ${bill.billNumber} - `);

                    bill.isInclusiveTax = false;
                    bill.taxAmount = matchSummary.newTax;
                    bill.totalAmount = matchSummary.newTotal;
                    bill.balanceDue = matchSummary.newBalanceDue;
                    bill.status = matchSummary.newStatus;

                    if (matchSummary.newStatus !== 'PAID') {
                        bill.paidAt = undefined;
                    }

                    if (bill.notes && bill.notes.includes('Is Inclusive Tax: true')) {
                        bill.notes = bill.notes.replace(/Is Inclusive Tax:\s*true/gi, 'Is Inclusive Tax: false (corrected to exclusive)');
                    }

                    await bill.save();

                    // Delete old initial booking ledger entries
                    await LedgerEntry.deleteMany({
                        bill: bill._id,
                        description: initialBillRegex
                    });

                    // Post new exclusive ledger entries
                    const actor = {
                        id: bill.createdBy || "6a2290019fa01283dd165204",
                        role: (bill.creatorRole || "ADMIN").toUpperCase()
                    };
                    await BillService.postBillToLedger(bill, actor);

                    if (shouldApplyAdvances && bill.status !== 'PAID' && bill.supplier) {
                        await BillService.applySupplierAdvanceToBill(bill._id);
                    }
                }));

                processed += batch.length;
                console.log(`  Updated ${processed} / ${billsToProcess.length} bills...`);
            }
        }

        console.log('\n===============================================================');
        console.log('  RECALCULATING AFFECTED ACCOUNTS');
        console.log('===============================================================');

        const apAccount = await AccountingCode.findOne({ code: "2.1.01", isDeleted: false })
            || await AccountingCode.findOne({ accountType: "Accounts Payable", isDeleted: false });
        if (apAccount) affectedAccountingCodes.add(apAccount._id.toString());

        const inputTaxAccount = await AccountingCode.findOne({ code: "INPUT TAX", isDeleted: false })
            || await AccountingCode.findOne({ code: "TAX0001", isDeleted: false })
            || await AccountingCode.findOne({ accountType: "Input Tax", isDeleted: false });
        if (inputTaxAccount) affectedAccountingCodes.add(inputTaxAccount._id.toString());

        console.log(`Total unique Accounting Codes to sync: ${affectedAccountingCodes.size}`);

        for (const codeId of affectedAccountingCodes) {
            const codeDoc = await AccountingCode.findById(codeId);
            if (!codeDoc) continue;

            const oldBal = codeDoc.currentBalance || 0;

            if (isExecute) {
                await syncAccountingCodeBalances(codeId);
                const updatedDoc = await AccountingCode.findById(codeId);
                console.log(`  ✓ Synced [${updatedDoc.code}] ${updatedDoc.name}: Balance: $${oldBal.toFixed(2)} -> $${(updatedDoc.currentBalance || 0).toFixed(2)}`);

                const linkedBankAccounts = await BankAccount.find({ accountingCode: codeId, isDeleted: false });
                for (const bankAcc of linkedBankAccounts) {
                    await recalculateRunningBalances(bankAcc._id);
                    console.log(`      ✓ Recalculated linked BankAccount: ${bankAcc.accountName || bankAcc.bankName}`);
                }
            } else {
                console.log(`  [DRY-RUN] Will sync [${codeDoc.code}] ${codeDoc.name} (Current Bal: $${oldBal.toFixed(2)})`);
            }
        }

        console.log('\n===============================================================');
        console.log(`  SAMPLE RESULTS (First 10 of ${summaryResults.length})`);
        console.log('===============================================================');
        console.table(summaryResults.slice(0, 10));

        if (summaryResults.length > 10) {
            console.log(`\n  SAMPLE RESULTS (Last 5 of ${summaryResults.length})`);
            console.table(summaryResults.slice(-5));
        }

        if (!isExecute) {
            console.log('\n💡 DRY RUN COMPLETE. No data was modified.');
            console.log('To execute these changes, run:');
            console.log('  node scripts/convert_inclusive_bills_to_exclusive.js --from-date=16/6/2026 --exclude-file=scripts/dontChnageBillTax.xlsx --execute\n');
        } else {
            console.log(`\n✅ EXECUTION COMPLETE! ${billsToProcess.length} bills, their ledger entries, and accounts have been successfully updated.\n`);
        }

    } catch (err) {
        console.error('Fatal error during execution:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

run();

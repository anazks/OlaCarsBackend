require('dotenv').config();
const mongoose = require('mongoose');

async function inspectAndCleanDuplicateBillItems(isDryRun = true) {
    try {
        console.log(`Connecting to MongoDB...`);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB successfully.');

        const Bill = require('../Src/modules/Bill/Model/BillModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const BillService = require('../Src/modules/Bill/Service/BillService');

        const bills = await Bill.find({ isDeleted: false });
        console.log(`Loaded ${bills.length} non-deleted bills.`);

        let billsWithDuplicates = 0;
        let totalDuplicateItemsFound = 0;
        const affectedBills = [];

        const getItemKey = (name, accId, price) => {
            const cleanName = (name || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
            const cleanAcc = (accId?._id || accId || '').toString().trim();
            const cleanPrice = Number(price || 0).toFixed(4);
            return `${cleanName}|${cleanAcc}|${cleanPrice}`;
        };

        for (const bill of bills) {
            if (!bill.items || bill.items.length <= 1) continue;

            const seenKeys = new Set();
            const uniqueItems = [];
            const duplicates = [];

            for (const item of bill.items) {
                const key = getItemKey(item.itemName, item.accountId, item.unitPrice);
                if (seenKeys.has(key)) {
                    duplicates.push(item);
                } else {
                    seenKeys.add(key);
                    uniqueItems.push(item);
                }
            }

            if (duplicates.length > 0) {
                billsWithDuplicates++;
                totalDuplicateItemsFound += duplicates.length;

                const oldTotal = bill.totalAmount;
                const newItemsSubtotal = uniqueItems.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)), 0);
                
                let newTotal = newItemsSubtotal;
                if (bill.taxPercentage > 0) {
                    if (bill.isInclusiveTax) {
                        newTotal = newItemsSubtotal;
                    } else {
                        const taxAmt = Math.round((newItemsSubtotal * (bill.taxPercentage / 100)) * 100) / 100;
                        newTotal = Math.round((newItemsSubtotal + taxAmt) * 100) / 100;
                    }
                }

                affectedBills.push({
                    billId: bill._id.toString(),
                    billNumber: bill.billNumber,
                    totalItemsCount: bill.items.length,
                    duplicateCount: duplicates.length,
                    uniqueItemsCount: uniqueItems.length,
                    oldTotal,
                    newTotal,
                    amountPaid: bill.amountPaid || 0,
                    duplicateItemNames: duplicates.map(d => `${d.itemName} (Qty: ${d.quantity}, Rate: $${d.unitPrice})`)
                });

                if (!isDryRun) {
                    if (newTotal < (bill.amountPaid || 0)) {
                        console.warn(`[SKIP] Bill ${bill.billNumber}: Cannot remove duplicates because new total ($${newTotal}) is less than amount already paid ($${bill.amountPaid}).`);
                        continue;
                    }

                    console.log(`[CLEANING] Bill ${bill.billNumber}: removing ${duplicates.length} duplicate items...`);
                    bill.items = uniqueItems;
                    bill.totalAmount = newTotal;
                    await bill.save();

                    // Rebuild ledger entries if bill is not DRAFT
                    if (bill.status !== 'DRAFT') {
                        const initialBillRegex = new RegExp(`^Bill ${bill.billNumber} - `);
                        await LedgerEntry.deleteMany({
                            bill: bill._id,
                            description: initialBillRegex
                        });

                        // Re-post corrected bill to ledger
                        const actor = { id: bill.createdBy, role: bill.creatorRole || 'ADMIN' };
                        await BillService.postBillToLedger(bill, actor);
                    }
                }
            }
        }

        console.log('\n================ SUMMARY ================');
        console.log(`Mode: ${isDryRun ? 'DRY RUN (No changes made)' : 'LIVE EXECUTION (Changes saved)'}`);
        console.log(`Total Bills Checked: ${bills.length}`);
        console.log(`Bills With Duplicate Items: ${billsWithDuplicates}`);
        console.log(`Total Duplicate Items Found: ${totalDuplicateItemsFound}`);
        console.log('=========================================');

        if (affectedBills.length > 0) {
            console.log('\nAffected Bills:');
            affectedBills.forEach((b, idx) => {
                console.log(`\n${idx + 1}. Bill: ${b.billNumber} (ID: ${b.billId})`);
                console.log(`   Items: ${b.totalItemsCount} total -> ${b.uniqueItemsCount} unique (${b.duplicateCount} duplicate(s) removed)`);
                console.log(`   Duplicates: ${b.duplicateItemNames.join(', ')}`);
                console.log(`   Total Amount: $${b.oldTotal} -> $${b.newTotal} (Paid: $${b.amountPaid})`);
            });
        }

    } catch (err) {
        console.error('Error running duplicate items cleaner:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

const isExecute = process.argv.includes('--execute');
inspectAndCleanDuplicateBillItems(!isExecute);

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../Src/config/dbConfig');

const Supplier = require('../Src/modules/Supplier/Model/SupplierModel');
const Bill = require('../Src/modules/Bill/Model/BillModel');
const PaymentMade = require('../Src/modules/PaymentMade/Model/PaymentMadeModel');
const InvoiceBillSetOffHistory = require('../Src/modules/BankAccount/Model/InvoiceBillSetOffHistoryModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');
const PaymentTransaction = require('../Src/modules/Payment/Model/PaymentTransactionModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const { syncAccountingCodeBalances } = require('../Src/modules/BankAccount/Service/BankAccountService');
const mongoose = require('mongoose');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resetVendorBillsAndHistory() {
    try {
        await connectDB();
        console.log("\n==========================================================");
        console.log("Starting Deep Reset of Vendor Bills, Ledger Entries & History...");
        console.log("==========================================================\n");

        const targetVendorNames = ["TEST VENDOR AUTO SETOFF", "DETAILENS INTERNACIONAL"];
        
        // Find active branch & accounting code for creating new bills
        const branch = await Branch.findOne({ isDeleted: false });
        if (!branch) throw new Error("No active branch found in DB.");

        let accCode = await AccountingCode.findOne({ code: "6.1.01", isDeleted: false });
        if (!accCode) accCode = await AccountingCode.findOne({ isDeleted: false });
        if (!accCode) throw new Error("No accounting code found in DB.");

        const creatorId = new mongoose.Types.ObjectId("6a2290019fa01283dd165204");

        for (const vendorName of targetVendorNames) {
            console.log(`\n----------------------------------------------------------`);
            console.log(`Processing Vendor: "${vendorName}"`);
            console.log(`----------------------------------------------------------`);

            // 1. Find or create Supplier
            let supplier = await Supplier.findOne({
                $or: [
                    { name: { $regex: new RegExp(escapeRegExp(vendorName), "i") } },
                    { companyName: { $regex: new RegExp(escapeRegExp(vendorName), "i") } },
                    { displayName: { $regex: new RegExp(escapeRegExp(vendorName), "i") } }
                ],
                isDeleted: { $ne: true }
            });

            if (!supplier) {
                console.log(`  • Supplier "${vendorName}" not found. Creating new supplier...`);
                supplier = await Supplier.create({
                    name: vendorName,
                    companyName: vendorName,
                    displayName: vendorName,
                    email: `${vendorName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
                    phone: "1234567890",
                    currency: "USD"
                });
                console.log(`  ✓ Created supplier ID: ${supplier._id}`);
            } else {
                console.log(`  ✓ Found supplier ID: ${supplier._id} (${supplier.name})`);
            }

            // 2. Find ALL existing bills for this vendor
            const bills = await Bill.find({ supplier: supplier._id });
            const billIds = bills.map(b => b._id);
            const billNumbers = bills.map(b => b.billNumber).filter(Boolean);
            console.log(`  • Found ${bills.length} existing bill(s): [${billNumbers.join(', ')}]`);

            // 3. Find ALL PaymentMade records
            const paymentsMade = await PaymentMade.find({
                $or: [
                    { supplier: supplier._id },
                    { "bills.billId": { $in: billIds } },
                    { notes: { $regex: new RegExp(escapeRegExp(vendorName), "i") } }
                ]
            });
            const paymentMadeIds = paymentsMade.map(p => p._id);
            const paymentNumbers = paymentsMade.map(p => p.paymentNumber).filter(Boolean);
            console.log(`  • Found ${paymentsMade.length} PaymentMade record(s)`);

            // 4. Find ALL InvoiceBillSetOffHistory records
            const setOffHistories = await InvoiceBillSetOffHistory.find({
                $or: [
                    { supplier: supplier._id },
                    { vendorPayment: { $in: paymentMadeIds } },
                    { "billSnapshots.bill": { $in: billIds } }
                ]
            });
            const historyIds = setOffHistories.map(h => h._id);
            console.log(`  • Found ${setOffHistories.length} SetOffHistory record(s)`);

            // 5. Find ALL PaymentTransaction records
            const paymentTransactions = await PaymentTransaction.find({
                $or: [
                    { contact: supplier._id },
                    { referenceId: { $in: [...billIds, ...paymentMadeIds, supplier._id] } },
                    { notes: { $regex: new RegExp(escapeRegExp(vendorName), "i") } },
                    ...billNumbers.map(num => ({ notes: { $regex: new RegExp(escapeRegExp(num), "i") } }))
                ]
            });
            const paymentTxIds = paymentTransactions.map(pt => pt._id);
            console.log(`  • Found ${paymentTransactions.length} PaymentTransaction record(s)`);

            // 6. Find ALL ManualJournal records
            const manualJournals = await ManualJournal.find({
                $or: [
                    { notes: { $regex: new RegExp(escapeRegExp(vendorName), "i") } },
                    { reference: { $regex: new RegExp(escapeRegExp(vendorName), "i") } },
                    ...billNumbers.map(num => ({ notes: { $regex: new RegExp(escapeRegExp(num), "i") } })),
                    ...billNumbers.map(num => ({ reference: { $regex: new RegExp(escapeRegExp(num), "i") } }))
                ]
            });
            const manualJournalIds = manualJournals.map(mj => mj._id);
            console.log(`  • Found ${manualJournals.length} ManualJournal record(s)`);

            // 7. Find ALL connected LedgerEntry records
            const ledgerQueryConditions = [
                { contact: supplier._id },
                { supplier: supplier._id },
                { bill: { $in: billIds } },
                { transaction: { $in: paymentTxIds } },
                { manualJournal: { $in: manualJournalIds } },
                { description: { $regex: new RegExp(escapeRegExp(vendorName), "i") } }
            ];

            for (const num of billNumbers) {
                ledgerQueryConditions.push({ description: { $regex: new RegExp(escapeRegExp(num), "i") } });
            }
            for (const pNum of paymentNumbers) {
                ledgerQueryConditions.push({ description: { $regex: new RegExp(escapeRegExp(pNum), "i") } });
            }

            const ledgerEntries = await LedgerEntry.find({ $or: ledgerQueryConditions });
            const ledgerEntryIds = ledgerEntries.map(l => l._id);
            console.log(`  • Found ${ledgerEntries.length} connected LedgerEntry record(s)`);

            // 8. Perform Deletions
            if (ledgerEntryIds.length > 0) {
                const delLE = await LedgerEntry.deleteMany({ _id: { $in: ledgerEntryIds } });
                console.log(`  ✓ Deleted ${delLE.deletedCount} LedgerEntry record(s)`);
            }
            if (manualJournalIds.length > 0) {
                const delMJ = await ManualJournal.deleteMany({ _id: { $in: manualJournalIds } });
                console.log(`  ✓ Deleted ${delMJ.deletedCount} ManualJournal record(s)`);
            }
            if (paymentTxIds.length > 0) {
                const delPT = await PaymentTransaction.deleteMany({ _id: { $in: paymentTxIds } });
                console.log(`  ✓ Deleted ${delPT.deletedCount} PaymentTransaction record(s)`);
            }
            if (historyIds.length > 0) {
                const delHist = await InvoiceBillSetOffHistory.deleteMany({ _id: { $in: historyIds } });
                console.log(`  ✓ Deleted ${delHist.deletedCount} SetOffHistory record(s)`);
            }
            if (paymentMadeIds.length > 0) {
                const delPM = await PaymentMade.deleteMany({ _id: { $in: paymentMadeIds } });
                console.log(`  ✓ Deleted ${delPM.deletedCount} PaymentMade record(s)`);
            }
            if (billIds.length > 0) {
                const delBills = await Bill.deleteMany({ _id: { $in: billIds } });
                console.log(`  ✓ Deleted ${delBills.deletedCount} Bill(s)`);
            }

            // 9. Unlink setOff / supplier metadata from BankTransactions and Bank LedgerEntries
            const txUnlinkResult = await BankTransaction.updateMany(
                { supplier: supplier._id },
                { $unset: { supplier: "", bills: "", setOffSummary: "" } }
            );
            const leUnlinkResult = await LedgerEntry.updateMany(
                { supplier: supplier._id },
                { $unset: { supplier: "", bills: "", setOffSummary: "" } }
            );
            console.log(`  ✓ Unlinked set-off metadata from ${txUnlinkResult.modifiedCount} BankTransaction(s) and ${leUnlinkResult.modifiedCount} LedgerEntry(s)`);

            // 10. Create 2 NEW Bills of $200 each for this vendor
            const createdNewBills = [];
            for (let i = 1; i <= 2; i++) {
                const count = await Bill.countDocuments();
                const prefix = vendorName.toUpperCase().includes("TEST") ? "BILL-TV" : "BILL-DI";
                const newBillNumber = `${prefix}-${String(count + 1000 + i).padStart(5, '0')}`;

                const newBill = await Bill.create({
                    billNumber: newBillNumber,
                    supplier: supplier._id,
                    branch: branch._id,
                    billDate: new Date(),
                    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    items: [
                        {
                            itemName: `Auto Parts / Services Procurement #${i}`,
                            quantity: 1,
                            unitPrice: 200,
                            accountId: accCode._id,
                            description: `Clean reset bill #${i} of $200 for ${supplier.name}`
                        }
                    ],
                    totalAmount: 200,
                    amountPaid: 0,
                    balanceDue: 200,
                    status: "OPEN",
                    createdBy: creatorId,
                    creatorRole: "ADMIN"
                });

                createdNewBills.push(newBill);
                console.log(`\n  SUCCESS: Created NEW Bill #${i} for ${supplier.name}:`);
                console.log(`  • Bill Number:   ${newBill.billNumber}`);
                console.log(`  • Total Amount:  $${newBill.totalAmount}`);
                console.log(`  • Balance Due:   $${newBill.balanceDue}`);
                console.log(`  • Status:        ${newBill.status}`);
            }
        }

        // Sync accounting code balances
        const apCode = await AccountingCode.findOne({ $or: [{ code: "2.1.01" }, { name: { $regex: /Accounts Payable|Cuenta por Pagar/i } }], isDeleted: { $ne: true } });
        const advPaidCode = await AccountingCode.findOne({ $or: [{ code: "1.1.05" }, { name: { $regex: /Advance Paid|Anticipo/i } }], isDeleted: { $ne: true } });
        if (apCode) await syncAccountingCodeBalances(apCode._id);
        if (advPaidCode) await syncAccountingCodeBalances(advPaidCode._id);
        console.log(`  ✓ Synced Accounting Code balances for Accounts Payable (2.1.01) & Advance Paid (1.1.05)`);

        console.log("\n==========================================================");
        console.log("Deep cleanup and vendor bill reset completed successfully!");
        console.log("==========================================================\n");

        process.exit(0);
    } catch (err) {
        console.error("\nFATAL ERROR during script execution:", err);
        process.exit(1);
    }
}

resetVendorBillsAndHistory();

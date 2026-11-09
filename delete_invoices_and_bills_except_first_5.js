require("dotenv").config();
const mongoose = require("mongoose");

const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");
const Bill = require("./Src/modules/Bill/Model/BillModel");
const PurchaseOrder = require("./Src/modules/PurchaseOrder/Model/PurchaseOrderModel");
const PaymentReceived = require("./Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const PaymentMade = require("./Src/modules/PaymentMade/Model/PaymentMadeModel");
const InvoiceBillSetOffHistory = require("./Src/modules/BankAccount/Model/InvoiceBillSetOffHistoryModel");
const BankTransaction = require("./Src/modules/BankAccount/Model/BankTransactionModel");
const LedgerEntry = require("./Src/modules/Ledger/Model/LedgerEntryModel");

async function deleteInvoicesAndBillsExceptFirst5() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsFresh?appName=Cluster0";
        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB successfully.\n");

        // ==========================================
        // 1. INVOICES IDENTIFICATION
        // ==========================================
        const totalInvoices = await Invoice.countDocuments();
        const first5Invoices = await Invoice.find({})
            .sort({ createdAt: 1, _id: 1 })
            .limit(5)
            .select("_id invoiceNumber createdAt")
            .lean();

        const keptInvoiceIds = first5Invoices.map(i => i._id);
        const keptInvoiceIdStrings = new Set(keptInvoiceIds.map(id => id.toString()));

        const invoicesToDelete = await Invoice.find({ _id: { $nin: keptInvoiceIds } })
            .select("_id invoiceNumber")
            .lean();
        const deletedInvoiceIds = invoicesToDelete.map(i => i._id);

        console.log("------------------------------------------");
        console.log(`[INVOICES] Total: ${totalInvoices}`);
        console.log(`[INVOICES] Keeping first ${keptInvoiceIds.length}:`);
        first5Invoices.forEach((inv, idx) => console.log(`   ${idx + 1}. ${inv.invoiceNumber} (${inv._id})`));
        console.log(`[INVOICES] To Delete: ${deletedInvoiceIds.length}`);

        // ==========================================
        // 2. BILLS IDENTIFICATION
        // ==========================================
        const totalBills = await Bill.countDocuments();
        const first5Bills = await Bill.find({})
            .sort({ createdAt: 1, _id: 1 })
            .limit(5)
            .select("_id billNumber createdAt purchaseOrder")
            .lean();

        const keptBillIds = first5Bills.map(b => b._id);
        const keptBillIdStrings = new Set(keptBillIds.map(id => id.toString()));

        const billsToDelete = await Bill.find({ _id: { $nin: keptBillIds } })
            .select("_id billNumber purchaseOrder")
            .lean();
        const deletedBillIds = billsToDelete.map(b => b._id);
        const poIdsToReset = billsToDelete
            .map(b => b.purchaseOrder)
            .filter(Boolean);

        console.log("------------------------------------------");
        console.log(`[BILLS] Total: ${totalBills}`);
        console.log(`[BILLS] Keeping first ${keptBillIds.length}:`);
        first5Bills.forEach((b, idx) => console.log(`   ${idx + 1}. ${b.billNumber} (${b._id})`));
        console.log(`[BILLS] To Delete: ${deletedBillIds.length}`);
        console.log(`[BILLS] Linked Purchase Orders to reset isBilled: ${poIdsToReset.length}`);
        console.log("------------------------------------------\n");

        // ==========================================
        // 3. EXECUTE INVOICE CLEANUP & DELETION
        // ==========================================
        if (deletedInvoiceIds.length > 0) {
            console.log("Starting Invoice Cleanup...");

            // 3a. Delete Invoice Documents
            const invDelRes = await Invoice.deleteMany({ _id: { $in: deletedInvoiceIds } });
            console.log(`✓ Deleted ${invDelRes.deletedCount} Invoice document(s).`);

            // 3b. Delete direct Invoice Ledger Entries
            const ledgerInvRes = await LedgerEntry.deleteMany({ invoice: { $in: deletedInvoiceIds } });
            console.log(`✓ Deleted ${ledgerInvRes.deletedCount} direct Invoice LedgerEntry document(s).`);

            // 3c. Clean references in PaymentReceived
            const prCleanRes = await PaymentReceived.updateMany(
                { "invoices.invoiceId": { $in: deletedInvoiceIds } },
                { $pull: { invoices: { invoiceId: { $in: deletedInvoiceIds } } } }
            );
            console.log(`✓ Cleaned deleted invoice references from ${prCleanRes.modifiedCount} PaymentReceived document(s).`);

            // 3d. Clean references in BankTransaction
            const btxUnsetRes = await BankTransaction.updateMany(
                { invoice: { $in: deletedInvoiceIds } },
                { $unset: { invoice: 1, setOffSummary: 1 } }
            );
            const btxPullRes = await BankTransaction.updateMany(
                { "invoices.invoiceId": { $in: deletedInvoiceIds } },
                { $pull: { invoices: { invoiceId: { $in: deletedInvoiceIds } } } }
            );
            console.log(`✓ Cleaned BankTransaction references (Unset: ${btxUnsetRes.modifiedCount}, Pulled: ${btxPullRes.modifiedCount}).`);

            // 3e. Clean references in LedgerEntry arrays
            const ledgerPullRes = await LedgerEntry.updateMany(
                { "invoices.invoiceId": { $in: deletedInvoiceIds } },
                { $pull: { invoices: { invoiceId: { $in: deletedInvoiceIds } } } }
            );
            console.log(`✓ Cleaned set-off references from ${ledgerPullRes.modifiedCount} LedgerEntry document(s).`);
        }

        // ==========================================
        // 4. EXECUTE BILL CLEANUP & DELETION
        // ==========================================
        if (deletedBillIds.length > 0) {
            console.log("\nStarting Bill Cleanup...");

            // 4a. Reset PO status so they can be re-billed if needed
            if (poIdsToReset.length > 0) {
                const poRes = await PurchaseOrder.updateMany(
                    { _id: { $in: poIdsToReset } },
                    { $set: { isBilled: false } }
                );
                console.log(`✓ Reset isBilled=false for ${poRes.modifiedCount} Purchase Order(s).`);
            }

            // 4b. Delete direct Bill Ledger Entries
            const ledgerBillRes = await LedgerEntry.deleteMany({ bill: { $in: deletedBillIds } });
            console.log(`✓ Deleted ${ledgerBillRes.deletedCount} direct Bill LedgerEntry document(s).`);

            // 4c. Clean references in PaymentMade
            const pmCleanRes = await PaymentMade.updateMany(
                { "bills.billId": { $in: deletedBillIds } },
                { $pull: { bills: { billId: { $in: deletedBillIds } } } }
            );
            console.log(`✓ Cleaned deleted bill references from ${pmCleanRes.modifiedCount} PaymentMade document(s).`);

            // 4d. Clean references in LedgerEntry arrays
            const ledgerBillPullRes = await LedgerEntry.updateMany(
                { "bills.billId": { $in: deletedBillIds } },
                { $pull: { bills: { billId: { $in: deletedBillIds } } } }
            );
            console.log(`✓ Cleaned bill set-off references from ${ledgerBillPullRes.modifiedCount} LedgerEntry document(s).`);

            // 4e. Delete Bill Documents
            const billDelRes = await Bill.deleteMany({ _id: { $in: deletedBillIds } });
            console.log(`✓ Deleted ${billDelRes.deletedCount} Bill document(s).`);
        }

        // ==========================================
        // 5. CLEAN SET-OFF HISTORIES
        // ==========================================
        console.log("\nCleaning Set-Off History records...");
        // Delete history records that only referenced deleted invoices or deleted bills
        const historyDelRes = await InvoiceBillSetOffHistory.deleteMany({
            $or: [
                {
                    "invoices.invoice": { $in: deletedInvoiceIds },
                    "invoices.invoice": { $nin: keptInvoiceIds }
                },
                {
                    "bills.bill": { $in: deletedBillIds },
                    "bills.bill": { $nin: keptBillIds }
                }
            ]
        });
        console.log(`✓ Deleted ${historyDelRes.deletedCount} Invoice/Bill Set-Off History document(s).`);

        // ==========================================
        // 6. VERIFY FINAL COUNTS
        // ==========================================
        const finalInvoices = await Invoice.countDocuments();
        const finalBills = await Bill.countDocuments();

        console.log("\n=======================================================");
        console.log("               FINAL VERIFICATION RESULTS             ");
        console.log("=======================================================");
        console.log(`Remaining Invoices:  ${finalInvoices} (Expected: 5)`);
        console.log(`Remaining Bills:     ${finalBills} (Expected: 5)`);

        const remainingInvoicesList = await Invoice.find({}).select("invoiceNumber totalAmountDue status").lean();
        console.log("Remaining Invoices List:");
        remainingInvoicesList.forEach((inv, i) => console.log(`   ${i + 1}. ${inv.invoiceNumber} (${inv._id})`));

        const remainingBillsList = await Bill.find({}).select("billNumber totalAmount status").lean();
        console.log("Remaining Bills List:");
        remainingBillsList.forEach((b, i) => console.log(`   ${i + 1}. ${b.billNumber} (${b._id})`));
        console.log("=======================================================\n");

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("❌ Error during deletion process:", error);
        process.exit(1);
    }
}

deleteInvoicesAndBillsExceptFirst5();


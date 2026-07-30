require("dotenv").config();
const mongoose = require("mongoose");

const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");
const PaymentReceived = require("./Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const InvoiceSetOffHistory = require("./Src/modules/BankAccount/Model/InvoiceSetOffHistoryModel");
const BankTransaction = require("./Src/modules/BankAccount/Model/BankTransactionModel");
const LedgerEntry = require("./Src/modules/Ledger/Model/LedgerEntryModel");

async function deleteInvoiceByNumber() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsFresh?appName=Cluster0";
        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("✓ Connected to MongoDB.");

        const targetInvoiceNumber = "INV-TEST-855376-3654";

        const invoice = await Invoice.findOne({
            $or: [
                { invoiceNumber: targetInvoiceNumber },
                { invoiceNumber: { $regex: new RegExp(targetInvoiceNumber, "i") } }
            ]
        });

        if (!invoice) {
            console.log(`❌ Invoice "${targetInvoiceNumber}" not found in DB.`);
            process.exit(0);
        }

        const invId = invoice._id;
        const invNum = invoice.invoiceNumber;
        console.log(`✓ Found target Invoice: #${invNum} (ID: ${invId})`);

        // 1. Delete Invoice document
        await Invoice.deleteOne({ _id: invId });
        console.log(`  ✓ Deleted Invoice document ${invId}`);

        // 2. Remove references from PaymentReceived
        const prRes = await PaymentReceived.deleteMany({
            $or: [
                { "invoices.invoiceId": invId },
                { "invoices.invoiceNumber": invNum }
            ]
        });
        console.log(`  ✓ Deleted ${prRes.deletedCount} PaymentReceived document(s) linked to this invoice.`);

        // 3. Remove references from InvoiceSetOffHistory
        const historyRes = await InvoiceSetOffHistory.deleteMany({
            $or: [
                { "invoiceSnapshots.invoice": invId },
                { "invoiceSnapshots.invoiceNumber": invNum }
            ]
        });
        console.log(`  ✓ Deleted ${historyRes.deletedCount} InvoiceSetOffHistory document(s) linked to this invoice.`);

        // 4. Update BankTransactions to strip invoice reference
        const btxUpdateRes = await BankTransaction.updateMany(
            {
                $or: [
                    { invoice: invId },
                    { "invoices.invoiceId": invId },
                    { "invoices.invoiceNumber": invNum },
                    { description: { $regex: new RegExp(invNum, "i") } }
                ]
            },
            {
                $unset: { invoice: 1 },
                $pull: { invoices: { $or: [{ invoiceId: invId }, { invoiceNumber: invNum }] } }
            }
        );
        console.log(`  ✓ Cleaned BankTransactions matching this invoice: ${btxUpdateRes.modifiedCount} modified.`);

        // 5. Update LedgerEntries to strip invoice description/metadata
        const ledgerEntries = await LedgerEntry.find({
            $or: [
                { "invoices.invoiceId": invId },
                { description: { $regex: new RegExp(invNum, "i") } }
            ]
        });

        for (const entry of ledgerEntries) {
            const invRegex = new RegExp(`(?:\\s*\\|?\\s*-?\\s*Set off:\\s*${invNum}|\\s*\\|?\\s*-?\\s*${invNum})`, 'gi');
            entry.description = (entry.description || '').replace(invRegex, '').trim();
            if (entry.invoices && Array.isArray(entry.invoices)) {
                entry.invoices = entry.invoices.filter((i) => String(i.invoiceId) !== String(invId) && i.invoiceNumber !== invNum);
            }
            await entry.save();
        }
        console.log(`  ✓ Cleaned LedgerEntries matching this invoice: ${ledgerEntries.length} updated.`);

        console.log("\n=======================================================");
        console.log(`✓ INVOICE #${invNum} (${invId}) AND ALL RELATED DOCUMENTS DELETED SUCCESSFULLY!`);
        console.log("=======================================================\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error deleting invoice:", error);
        process.exit(1);
    }
}

deleteInvoiceByNumber();

require("dotenv").config();
const mongoose = require("mongoose");

const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");
const PaymentReceived = require("./Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const InvoiceSetOffHistory = require("./Src/modules/BankAccount/Model/InvoiceSetOffHistoryModel");
const BankTransaction = require("./Src/modules/BankAccount/Model/BankTransactionModel");
const LedgerEntry = require("./Src/modules/Ledger/Model/LedgerEntryModel");

async function deleteAllInvoicesAndRelated() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsFresh?appName=Cluster0";
        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("✓ Connected to MongoDB.");

        // 1. Delete all Invoice documents
        const invRes = await Invoice.deleteMany({});
        console.log(`✓ Deleted ${invRes.deletedCount} Invoice document(s).`);

        // 2. Delete all PaymentReceived documents
        const prRes = await PaymentReceived.deleteMany({});
        console.log(`✓ Deleted ${prRes.deletedCount} PaymentReceived document(s).`);

        // 3. Delete all InvoiceSetOffHistory documents
        const historyRes = await InvoiceSetOffHistory.deleteMany({});
        console.log(`✓ Deleted ${historyRes.deletedCount} InvoiceSetOffHistory document(s).`);

        // 4. Clear invoice metadata from BankTransactions
        const btxRes = await BankTransaction.updateMany(
            {},
            {
                $unset: { invoice: 1, setOffSummary: 1 },
                $set: { invoices: [] }
            }
        );
        console.log(`✓ Cleaned ${btxRes.modifiedCount} BankTransaction document(s).`);

        // 5. Clear invoice metadata from LedgerEntries
        const ledgerEntries = await LedgerEntry.find({
            $or: [
                { invoices: { $exists: true, $not: { $size: 0 } } },
                { description: { $regex: /INV-/i } }
            ]
        });

        for (const entry of ledgerEntries) {
            entry.description = (entry.description || '').replace(/\s*\|?\s*-?\s*Set off:\s*INV-[\w-]+|\s*\|?\s*-?\s*INV-[\w-]+/gi, '').trim();
            entry.invoices = [];
            entry.setOffSummary = undefined;
            await entry.save();
        }
        console.log(`✓ Cleaned ${ledgerEntries.length} LedgerEntry document(s).`);

        console.log("\n=======================================================");
        console.log("✓ ALL INVOICES AND RELATED SET-OFF DOCUMENTS DELETED SUCCESSFULLY!");
        console.log("=======================================================\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error deleting all invoices:", error);
        process.exit(1);
    }
}

deleteAllInvoicesAndRelated();

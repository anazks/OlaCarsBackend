const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load backend env
dotenv.config({ path: path.join(__dirname, "../.env") });

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const PaymentReceived = require("../Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const PaymentTransaction = require("../Src/modules/Payment/Model/PaymentTransactionModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function runCleanup() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // 1. Find and delete mock PaymentReceived records
        const mockPRs = await PaymentReceived.find({ paymentNumber: /MOCK/i });
        const prIds = mockPRs.map(pr => pr._id);
        console.log(`Found ${mockPRs.length} mock PaymentReceived records:`, mockPRs.map(pr => pr.paymentNumber));

        if (prIds.length > 0) {
            await PaymentReceived.deleteMany({ _id: { $in: prIds } });
            console.log("Deleted mock PaymentReceived records.");
        }

        // 2. Find and delete mock Invoices
        const mockInvs = await Invoice.find({ invoiceNumber: /MOCK/i });
        const invIds = mockInvs.map(inv => inv._id);
        console.log(`Found ${mockInvs.length} mock Invoice records:`, mockInvs.map(inv => inv.invoiceNumber));

        if (invIds.length > 0) {
            await Invoice.deleteMany({ _id: { $in: invIds } });
            console.log("Deleted mock Invoice records.");
        }

        // 3. Find and delete associated PaymentTransactions
        const mockTxs = await PaymentTransaction.find({
            $or: [
                { referenceId: { $in: prIds } },
                { notes: /MOCK/i }
            ]
        });
        const txIds = mockTxs.map(tx => tx._id);
        console.log(`Found ${mockTxs.length} mock PaymentTransaction records.`);

        if (txIds.length > 0) {
            await PaymentTransaction.deleteMany({ _id: { $in: txIds } });
            console.log("Deleted mock PaymentTransaction records.");
        }

        // 4. Find and delete associated LedgerEntries
        const mockLedgers = await LedgerEntry.find({
            $or: [
                { transaction: { $in: txIds } },
                { description: /MOCK/i }
            ]
        });
        console.log(`Found ${mockLedgers.length} mock LedgerEntry records.`);

        if (mockLedgers.length > 0) {
            await LedgerEntry.deleteMany({ _id: { $in: mockLedgers.map(l => l._id) } });
            console.log("Deleted mock LedgerEntry records.");
        }

        console.log("\n✅ CLEANUP COMPLETED SUCCESSFULLY! All mock records have been removed from the database.");
    } catch (err) {
        console.error("Error running cleanup:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

runCleanup();

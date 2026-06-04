const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function runMigration() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        // 1. Correct the Accounting Code Categories
        console.log("Updating accounting code categories...");
        
        await AccountingCode.updateOne({ code: "4000" }, { $set: { category: "EXPENSE" } });
        console.log("- Code 4000 (Salary) set to EXPENSE.");
        
        await AccountingCode.updateOne({ code: "1200" }, { $set: { category: "ASSET" } });
        console.log("- Code 1200 (Accounts Receivable) set to ASSET.");
        
        await AccountingCode.updateOne({ code: "4001" }, { $set: { category: "INCOME" } });
        console.log("- Code 4001 (Rental income) set to INCOME.");

        // 2. Fetch all required codes for matching
        const arAccount = await AccountingCode.findOne({ code: "1200" });
        const salesAccount = await AccountingCode.findOne({ code: "4100" });

        if (!arAccount || !salesAccount) {
            throw new Error("Essential accounting codes (1200 or 4100) not found in DB.");
        }

        // 3. Migrate historical ledger entries
        console.log("Migrating existing ledger entries...");

        // A. Invoice Ledger Entries
        const invoiceEntries = await LedgerEntry.find({ description: /Invoice Created/i });
        console.log(`Found ${invoiceEntries.length} invoice ledger entries to migrate.`);
        for (const entry of invoiceEntries) {
            if (entry.accountingCode.toString() === arAccount._id.toString()) {
                entry.type = "DEBIT";
                entry.description = entry.description.replace(/Credit Accounts Receivable/i, "Debit Accounts Receivable");
                await entry.save();
            } else if (entry.accountingCode.toString() === salesAccount._id.toString()) {
                entry.type = "CREDIT";
                entry.description = entry.description.replace(/Debit Rental Income/i, "Credit Rental Income");
                await entry.save();
            }
        }
        console.log("Invoice ledger entries migration complete.");

        // B. Payment Received Ledger Entries
        const paymentEntries = await LedgerEntry.find({ description: /Payment Received/i });
        console.log(`Found ${paymentEntries.length} payment received ledger entries to migrate.`);
        for (const entry of paymentEntries) {
            if (entry.accountingCode.toString() === arAccount._id.toString()) {
                entry.type = "CREDIT";
                entry.description = entry.description.replace(/Debit Accounts Receivable/i, "Credit Accounts Receivable");
                await entry.save();
            } else {
                // If it is any other account (Bank/Cash), it should be DEBITed
                entry.type = "DEBIT";
                entry.description = entry.description.replace(/Credit Bank\/Cash/i, "Debit Bank/Cash");
                await entry.save();
            }
        }
        console.log("Payment received ledger entries migration complete.");

        console.log("Migration finished successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

runMigration();

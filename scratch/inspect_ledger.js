const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

        const activeBanks = await BankAccount.find({ isDeleted: false });
        console.log(`Active bank accounts: ${activeBanks.length}`);
        for (const bank of activeBanks) {
            console.log(`- Bank: ${bank.accountName || bank.bankName} (ID: ${bank._id}, Code ID: ${bank.accountingCode})`);
            const count = await LedgerEntry.countDocuments({ accountingCode: bank.accountingCode });
            console.log(`  LedgerEntry count: ${count}`);

            // Fetch last 5 entries
            const entries = await LedgerEntry.find({ accountingCode: bank.accountingCode })
                .sort({ createdAt: -1 })
                .limit(5);

            for (const entry of entries) {
                console.log(`    Entry ID: ${entry._id}, Date: ${entry.entryDate}, Amount: ${entry.amount}, Type: ${entry.type}, Description: "${entry.description}", manualJournal: ${entry.manualJournal}`);
                if (entry.manualJournal) {
                    const partners = await LedgerEntry.find({ manualJournal: entry.manualJournal, _id: { $ne: entry._id } })
                        .populate('accountingCode');
                    for (const partner of partners) {
                        const parent = partner.accountingCode.parentAccount
                            ? (await AccountingCode.findById(partner.accountingCode.parentAccount))?.name
                            : null;
                        console.log(`      Partner: ${partner.accountingCode.name} (Code: ${partner.accountingCode.code}, Parent: ${parent || 'none'})`);
                    }
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

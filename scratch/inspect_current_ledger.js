const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const accounts = await BankAccount.find({ isDeleted: false });
        console.log(`Found ${accounts.length} active bank accounts:`);
        for (const acc of accounts) {
            const count = await LedgerEntry.countDocuments({ accountingCode: acc.accountingCode });
            console.log(`- ID: ${acc._id}, Name: ${acc.accountName || acc.bankName}, Code: ${acc.accountingCode}, Entries: ${count}, Balance: ${acc.currentBalance}`);
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();

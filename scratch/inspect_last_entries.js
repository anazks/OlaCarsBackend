const mongoose = require('mongoose');
require('dotenv').config();

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const accountId = '6a280e00abfae20029fc99a7';
        const account = await BankAccount.findById(accountId);
        console.log('Account Code:', account.accountingCode);

        // Fetch last 10 entries in ascending order (chronological)
        const ascEntries = await LedgerEntry.find({ accountingCode: account.accountingCode })
            .sort({ entryDate: 1, createdAt: 1, _id: 1 });

        console.log(`\n=== LAST 10 ENTRIES IN ASCENDING (CHRONOLOGICAL) ORDER (Total: ${ascEntries.length}) ===`);
        const last10Asc = ascEntries.slice(-10);
        last10Asc.forEach((e, idx) => {
            console.log(`ASC #${ascEntries.length - 10 + idx + 1}: ID=${e._id}, createdAt=${e.createdAt}, Date=${e.entryDate.toISOString()}, Type=${e.type}, Amount=${e.amount}, RunningBalance=${e.runningBalance}, Desc=${e.description.substring(0, 50)}...`);
        });

        // Fetch last 10 entries in descending order (as requested by getBankTransactions desc sort)
        const descEntries = await LedgerEntry.find({ accountingCode: account.accountingCode })
            .sort({ entryDate: -1, _id: -1 })
            .limit(10);

        console.log(`\n=== FIRST 10 ENTRIES IN DESCENDING ORDER (as returned by API) ===`);
        descEntries.forEach((e, idx) => {
            console.log(`DESC #${idx + 1}: ID=${e._id}, createdAt=${e.createdAt}, Date=${e.entryDate.toISOString()}, Type=${e.type}, Amount=${e.amount}, RunningBalance=${e.runningBalance}, Desc=${e.description.substring(0, 50)}...`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

inspect();

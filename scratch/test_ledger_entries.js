const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

        console.log('--- Checking Recent Manual Journals ---');
        const recentJournals = await ManualJournal.find()
            .sort({ createdAt: -1 })
            .limit(5);

        console.log(`Found ${recentJournals.length} recent manual journals:`);

        for (const j of recentJournals) {
            console.log(`\nJournal ID: ${j._id} | Date: ${j.date} | Desc: ${j.description}`);
            console.log(`Lines count in journal: ${j.lines?.length}`);
            for (const l of j.lines || []) {
                console.log(`  - Line: Type=${l.type}, Amount=${l.amount}, Code=${l.accountingCode?.code || l.accountingCode} (${l.accountingCode?.name}), Contact=${l.contact} (${l.contactModel})`);
            }

            const ledgerEntries = await LedgerEntry.find({ manualJournal: j._id }).populate('accountingCode');
            console.log(`  Corresponding LedgerEntry docs in DB (${ledgerEntries.length} legs):`);
            for (const le of ledgerEntries) {
                console.log(`    * LedgerEntry ID: ${le._id} | Code: ${le.accountingCode?.code || le.accountingCode} (${le.accountingCode?.name}) | Type: ${le.type} | Amount: ${le.amount} | Balance: ${le.runningBalance}`);
            }
        }
    } catch (err) {
        console.error('Error verifying ledger entries:', err);
    } finally {
        mongoose.disconnect();
    }
});

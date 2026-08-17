const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/ManualJournal/Model/ManualJournalModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function testFetch() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB\n");

        // Grab any LedgerEntry
        const sampleEntry = await LedgerEntry.findOne({ isDeleted: { $ne: true } }).populate('accountingCode manualJournal');
        console.log("Sample LedgerEntry:", {
            _id: sampleEntry?._id,
            manualJournal: sampleEntry?.manualJournal,
            transactionId: sampleEntry?.transactionId,
            referenceId: sampleEntry?.referenceId,
            accountingCode: sampleEntry?.accountingCode?.code
        });

        if (sampleEntry?.manualJournal) {
            const mjId = sampleEntry.manualJournal._id || sampleEntry.manualJournal;
            const related = await LedgerEntry.find({ manualJournal: mjId }).populate('accountingCode');
            console.log(`\nFound ${related.length} related entries for manualJournal ${mjId}:`);
            related.forEach(r => console.log(`  - ${r._id} | Code: ${r.accountingCode?.code} | Type: ${r.type} | Amount: ${r.amount}`));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testFetch();

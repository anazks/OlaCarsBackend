const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Branch/Model/BranchModel');
require('../Src/modules/Driver/Model/DriverModel');

const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function showDetails() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const targetId = '6a61c0f3723443486b35c711';
        const ledgerDoc = await LedgerEntry.findById(targetId)
            .populate('accountingCode')
            .populate('branch');

        console.log('====================================================');
        console.log('DETAILS OF THE TOP LEDGER TRANSACTION (ID: 6a61c0f3723443486b35c711)');
        console.log('====================================================');

        if (ledgerDoc) {
            console.log(JSON.stringify(ledgerDoc.toObject(), null, 2));

            if (ledgerDoc.manualJournal) {
                console.log('\n----------------------------------------------------');
                console.log('LINKED MANUAL JOURNAL DETAILS:');
                console.log('----------------------------------------------------');
                const journalDoc = await ManualJournal.findById(ledgerDoc.manualJournal);
                if (journalDoc) {
                    console.log(JSON.stringify(journalDoc.toObject(), null, 2));
                } else {
                    console.log('No ManualJournal document found with ID:', ledgerDoc.manualJournal);
                }
            }
        } else {
            console.log('LedgerEntry not found with ID:', targetId);
        }

        // Also check if there is a BankTransaction matched with this transactionId
        if (ledgerDoc && ledgerDoc.transactionId) {
            console.log('\n----------------------------------------------------');
            console.log('MATCHED BANK TRANSACTION (by transactionId):');
            console.log('----------------------------------------------------');
            const btx = await BankTransaction.findOne({ transactionId: ledgerDoc.transactionId });
            if (btx) {
                console.log(JSON.stringify(btx.toObject(), null, 2));
            } else {
                console.log('No BankTransaction found with transactionId:', ledgerDoc.transactionId);
            }
        }

    } catch (err) {
        console.error('Error fetching details:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

showDetails();

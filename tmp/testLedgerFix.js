const mongoose = require('mongoose');
const PaymentTransaction = require('./Src/modules/Payment/Model/PaymentTransactionModel');
const LedgerEntry = require('./Src/modules/Ledger/Model/LedgerEntryModel');
const { autoGenerateLedgerEntry } = require('./Src/modules/Ledger/Service/LedgerService');
require('dotenv').config();

async function testLedgerCreation() {
    console.log('Connecting to DB with URI:', process.env.MONGO_URI ? 'Present' : 'MISSING');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // Create a dummy payment (don't save to DB yet, just for testing the service)
    const dummyPayment = {
        _id: new mongoose.Types.ObjectId(),
        accountingCode: new mongoose.Types.ObjectId(),
        transactionType: 'DEBIT',
        referenceModel: 'PurchaseOrder',
        referenceId: new mongoose.Types.ObjectId(),
        totalAmount: 500,
        status: 'COMPLETED',
        notes: 'Test payment'
    };

    console.log('Testing autoGenerateLedgerEntry for first time...');
    await autoGenerateLedgerEntry(dummyPayment);
    console.log('First call done.');

    console.log('Testing idempotency (second call for same ID)...');
    await autoGenerateLedgerEntry(dummyPayment);
    console.log('Second call done.');

    // Find the entry
    const entries = await LedgerEntry.find({ transaction: dummyPayment._id });
    console.log(`Entries created: ${entries.length}`);
    if (entries.length === 1) {
        console.log('SUCCESS: Idempotency works!');
    } else {
        console.log('FAILURE: Duplicate entries found!');
    }

    // Clean up
    await LedgerEntry.deleteMany({ transaction: dummyPayment._id });
    console.log('Cleanup done.');

    await mongoose.disconnect();
    process.exit(0);
}

testLedgerCreation().catch(console.error);

const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Import Models
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
    const PaymentTransaction = require('../Src/modules/Payment/Model/PaymentTransactionModel');
    const { Invoice } = require('../src/modules/Invoice/Model/InvoiceModel');

    console.log('--- DB CLEARANCE ACTION ---');
    
    // Get counts
    const ledgerCount = await LedgerEntry.countDocuments();
    const prCount = await PaymentReceived.countDocuments();
    const trxCount = await PaymentTransaction.countDocuments();
    
    console.log(`Current counts in database:`);
    console.log(`- LedgerEntry: ${ledgerCount}`);
    console.log(`- PaymentReceived: ${prCount}`);
    console.log(`- PaymentTransaction: ${trxCount}`);

    // Delete LedgerEntry
    console.log('\nClearing all LedgerEntry documents...');
    const delLedger = await LedgerEntry.deleteMany({});
    console.log(`Deleted ${delLedger.deletedCount} LedgerEntry documents.`);

    // Delete PaymentReceived
    console.log('\nClearing all PaymentReceived documents...');
    const delPR = await PaymentReceived.deleteMany({});
    console.log(`Deleted ${delPR.deletedCount} PaymentReceived documents.`);

    // Delete PaymentTransaction
    console.log('\nClearing all PaymentTransaction documents...');
    const delTrx = await PaymentTransaction.deleteMany({});
    console.log(`Deleted ${delTrx.deletedCount} PaymentTransaction documents.`);

    // Also reset all invoices' payment tracking (amountPaid, status, payments array) to sync them
    console.log('\nResetting all Invoice payment details back to unpaid status...');
    const invoices = await Invoice.find({});
    let resetCount = 0;
    for (const invoice of invoices) {
        invoice.amountPaid = 0;
        invoice.status = 'PENDING';
        invoice.payments = [];
        await invoice.save();
        resetCount++;
    }
    console.log(`Successfully reset payment details on ${resetCount} invoices.`);

    console.log('\nDatabase clearance completed successfully.');
    await mongoose.disconnect();
}

run().catch(console.error);

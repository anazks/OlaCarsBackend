const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Import Models
    const { Invoice } = require('../src/modules/Invoice/Model/InvoiceModel');
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const PaymentTransaction = require('../Src/modules/Payment/Model/PaymentTransactionModel');
    const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    console.log(`Searching for invoices created since: ${thirtyMinutesAgo.toISOString()}`);

    const recentInvoices = await Invoice.find({
        createdAt: { $gte: thirtyMinutesAgo }
    });

    console.log(`Found ${recentInvoices.length} invoices created in the last 30 minutes.\n`);

    if (recentInvoices.length > 0) {
        for (const invoice of recentInvoices) {
            console.log(`Processing deletion for Invoice [Number: ${invoice.invoiceNumber}, ID: ${invoice._id}]`);

            // 1. Delete PaymentReceived records referencing this invoice
            const prRecords = await PaymentReceived.find({
                'invoices.invoiceId': invoice._id
            });
            console.log(`- Found ${prRecords.length} PaymentReceived records associated with this invoice.`);
            for (const pr of prRecords) {
                // Find and delete PaymentTransactions for this PaymentReceived
                const prTrxs = await PaymentTransaction.find({
                    referenceId: pr._id,
                    referenceModel: 'PaymentReceived'
                });
                console.log(`  - Found ${prTrxs.length} PaymentTransactions for PaymentReceived ${pr.paymentNumber}`);
                for (const trx of prTrxs) {
                    // Delete ledger entries for this transaction
                    const deletedTrxLedger = await LedgerEntry.deleteMany({ transaction: trx._id });
                    console.log(`    - Deleted ${deletedTrxLedger.deletedCount} ledger entries for PaymentTransaction ${trx._id}`);
                    // Delete transaction
                    await PaymentTransaction.deleteOne({ _id: trx._id });
                    console.log(`    - Deleted PaymentTransaction ${trx._id}`);
                }
                // Delete PaymentReceived itself
                await PaymentReceived.deleteOne({ _id: pr._id });
                console.log(`  - Deleted PaymentReceived record ${pr.paymentNumber}`);
            }

            // 2. Delete PaymentTransactions directly referencing the Invoice
            const invoiceTrxs = await PaymentTransaction.find({
                referenceId: invoice._id,
                referenceModel: 'Invoice'
            });
            console.log(`- Found ${invoiceTrxs.length} PaymentTransactions directly referencing the invoice.`);
            for (const trx of invoiceTrxs) {
                // Delete ledger entries for this transaction
                const deletedTrxLedger = await LedgerEntry.deleteMany({ transaction: trx._id });
                console.log(`  - Deleted ${deletedTrxLedger.deletedCount} ledger entries for PaymentTransaction ${trx._id}`);
                // Delete transaction
                await PaymentTransaction.deleteOne({ _id: trx._id });
                console.log(`  - Deleted PaymentTransaction ${trx._id}`);
            }

            // 3. Delete double-entry ledger entries created for the invoice itself
            const deletedInvoiceLedger = await LedgerEntry.deleteMany({
                description: { $regex: new RegExp(invoice.invoiceNumber) }
            });
            console.log(`- Deleted ${deletedInvoiceLedger.deletedCount} general ledger entries matching invoice number "${invoice.invoiceNumber}"`);

            // 4. Delete the Invoice itself
            await Invoice.deleteOne({ _id: invoice._id });
            console.log(`- Deleted Invoice record ${invoice.invoiceNumber}\n`);
        }
        console.log('Cleanup completed successfully.');
    } else {
        console.log('No recent invoices found to delete.');
    }

    await mongoose.disconnect();
}

run().catch(console.error);

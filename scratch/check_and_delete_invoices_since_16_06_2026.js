const mongoose = require('mongoose');
require('dotenv').config();

async function checkAndDeleteInvoices() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/olacars';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB.');

        const Invoice = mongoose.model('Invoice', new mongoose.Schema({}, { strict: false }), 'invoices');
        const LedgerEntry = mongoose.model('LedgerEntry', new mongoose.Schema({}, { strict: false }), 'ledgerentries');

        const cutoffDate = new Date('2026-06-16T00:00:00.000Z');
        console.log(`Checking Invoices with invoiceDate/generatedAt/createdAt >= ${cutoffDate.toISOString()}...`);

        const invoicesToDelete = await Invoice.find({
            isDeleted: false,
            $or: [
                { invoiceDate: { $gte: cutoffDate } },
                { invoiceDate: { $exists: false }, generatedAt: { $gte: cutoffDate } },
                { invoiceDate: { $exists: false }, generatedAt: { $exists: false }, createdAt: { $gte: cutoffDate } }
            ]
        });

        console.log(`Found ${invoicesToDelete.length} Invoice records since 16/06/2026.`);

        const invoiceIds = invoicesToDelete.map(i => i._id);
        const invoiceNumbers = invoicesToDelete.map(i => i.invoiceNumber).filter(Boolean);

        // Check if execute flag is provided
        const shouldExecute = process.argv.includes('--execute');

        if (!shouldExecute) {
            console.log('\n--- DRY RUN SUMMARY ---');
            console.log(`Invoices to remove: ${invoicesToDelete.length}`);
            console.log('To execute the deletion, run this script with --execute');
            process.exit(0);
        }

        console.log('\n--- EXECUTING INVOICE DELETION ---');

        // Delete (or mark isDeleted: true / hard delete as requested)
        const delRes = await Invoice.deleteMany({ _id: { $in: invoiceIds } });
        console.log(`Successfully deleted ${delRes.deletedCount} Invoice records.`);

        // Clean up any ledger entries referencing these invoice numbers/IDs if any exist
        if (invoiceNumbers.length > 0) {
            const ledgerDel = await LedgerEntry.deleteMany({
                $or: [
                    { referenceId: { $in: invoiceIds } },
                    { description: { $regex: invoiceNumbers.slice(0, 100).join('|') } }
                ]
            });
            console.log(`Cleaned up ${ledgerDel.deletedCount} associated LedgerEntry records.`);
        }

        console.log('Invoice deletion completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error during checkAndDeleteInvoices:', err);
        process.exit(1);
    }
}

checkAndDeleteInvoices();

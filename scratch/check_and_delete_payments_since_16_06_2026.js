const mongoose = require('mongoose');
require('dotenv').config();

async function checkAndDeletePayments() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/olacars';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB.');

        const PaymentReceived = mongoose.model('PaymentReceived', new mongoose.Schema({}, { strict: false }), 'paymentreceiveds');
        const PaymentTransaction = mongoose.model('PaymentTransaction', new mongoose.Schema({}, { strict: false }), 'paymenttransactions');
        const LedgerEntry = mongoose.model('LedgerEntry', new mongoose.Schema({}, { strict: false }), 'ledgerentries');
        const Invoice = mongoose.model('Invoice', new mongoose.Schema({}, { strict: false }), 'invoices');

        const cutoffDate = new Date('2026-06-16T00:00:00.000Z');
        console.log(`Checking Payments Received with paymentDate >= ${cutoffDate.toISOString()}...`);

        const paymentsToDelete = await PaymentReceived.find({
            paymentDate: { $gte: cutoffDate }
        });

        console.log(`Found ${paymentsToDelete.length} PaymentReceived records since 16/06/2026.`);

        const paymentIds = paymentsToDelete.map(p => p._id);
        const paymentNumbers = paymentsToDelete.map(p => p.paymentNumber);

        // Find associated PaymentTransactions
        const paymentTxs = await PaymentTransaction.find({
            $or: [
                { referenceId: { $in: paymentIds } },
                { notes: { $regex: paymentNumbers.filter(Boolean).join('|') || 'NON_EXISTENT' } }
            ]
        });
        console.log(`Found ${paymentTxs.length} associated PaymentTransaction records.`);

        const txIds = paymentTxs.map(t => t._id);

        // Find associated LedgerEntries
        const ledgerEntries = await LedgerEntry.find({
            $or: [
                { transactionId: { $in: txIds } },
                { description: { $regex: paymentNumbers.filter(Boolean).slice(0, 100).join('|') || 'NON_EXISTENT' } }
            ]
        });
        console.log(`Found ${ledgerEntries.length} associated LedgerEntry records.`);

        // Check if execute parameter passed
        const shouldExecute = process.argv.includes('--execute');

        if (!shouldExecute) {
            console.log('\n--- DRY RUN SUMMARY ---');
            console.log(`PaymentReceived to delete: ${paymentsToDelete.length}`);
            console.log(`PaymentTransaction to delete: ${paymentTxs.length}`);
            console.log(`LedgerEntry to delete: ${ledgerEntries.length}`);
            console.log('To perform the deletion, run this script with --execute');
            process.exit(0);
        }

        console.log('\n--- EXECUTING DELETION & INVOICE REVERT ---');

        // 1. Unlink payments from invoices & revert invoice balances
        console.log('Reverting invoices linked to deleted payments...');
        for (const pmt of paymentsToDelete) {
            if (pmt.invoices && pmt.invoices.length > 0) {
                for (const invRef of pmt.invoices) {
                    const inv = await Invoice.findById(invRef.invoiceId);
                    if (inv) {
                        const amountApplied = invRef.amountApplied || 0;
                        inv.amountPaid = Math.max(0, (inv.amountPaid || 0) - amountApplied);
                        inv.balance = (inv.totalAmountDue || 0) - inv.amountPaid;
                        inv.status = inv.amountPaid <= 0 ? 'PENDING' : 'PARTIAL';
                        // Remove payment from inv.payments array if paymentNumber matches
                        if (inv.payments && Array.isArray(inv.payments)) {
                            inv.payments = inv.payments.filter(p => !p.note || !p.note.includes(pmt.paymentNumber));
                        }
                        await Invoice.updateOne({ _id: inv._id }, {
                            $set: {
                                amountPaid: inv.amountPaid,
                                balance: inv.balance,
                                status: inv.status,
                                payments: inv.payments
                            }
                        });
                    }
                }
            }
        }

        // 2. Delete PaymentReceived docs
        const delPR = await PaymentReceived.deleteMany({ _id: { $in: paymentIds } });
        console.log(`Deleted ${delPR.deletedCount} PaymentReceived records.`);

        // 3. Delete PaymentTransaction docs
        if (txIds.length > 0) {
            const delTx = await PaymentTransaction.deleteMany({ _id: { $in: txIds } });
            console.log(`Deleted ${delTx.deletedCount} PaymentTransaction records.`);
        }

        // 4. Delete LedgerEntry docs
        const ledgerIdsToDelete = ledgerEntries.map(l => l._id);
        if (ledgerIdsToDelete.length > 0) {
            const delLedger = await LedgerEntry.deleteMany({ _id: { $in: ledgerIdsToDelete } });
            console.log(`Deleted ${delLedger.deletedCount} LedgerEntry records.`);
        }

        console.log('Deletion and cleanup completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error during checkAndDeletePayments:', err);
        process.exit(1);
    }
}

checkAndDeletePayments();

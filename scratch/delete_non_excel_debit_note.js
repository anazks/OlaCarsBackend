const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Invoice = require('../Src/modules/Invoice/Model/InvoiceModel');
    const DebitNote = require('../Src/modules/DebitNote/Model/DebitNoteModel');

    const targetId = '6a66e018de9e109c053da235';
    const note = await DebitNote.findById(targetId);

    if (!note) {
        console.log('Debit Note not found or already deleted.');
        process.exit(0);
    }

    console.log('TARGET DEBIT NOTE TO DELETE:', {
        _id: note._id,
        debitNoteNumber: note.debitNoteNumber,
        amount: note.amount,
        reason: note.reason,
        status: note.status,
        invoiceId: note.invoiceId
    });

    if (note.invoiceId) {
        const invModel = typeof Invoice.findById === 'function' ? Invoice : Invoice.Invoice || Invoice;
        const inv = await invModel.findById(note.invoiceId);
        if (inv) {
            console.log('BEFORE REVERT INVOICE:', {
                _id: inv._id,
                invoiceNumber: inv.invoiceNumber,
                totalAmountDue: inv.totalAmountDue,
                amountPaid: inv.amountPaid,
                balance: inv.balance
            });

            const newTotal = Math.max(0, (inv.totalAmountDue || 0) - note.amount);
            const newBalance = Math.max(0, newTotal - (inv.amountPaid || 0));
            let newStatus = inv.status;
            if (newBalance <= 0) newStatus = 'PAID';
            else if (inv.amountPaid > 0) newStatus = 'PARTIAL';
            else newStatus = 'PENDING';

            await invModel.findByIdAndUpdate(note.invoiceId, {
                $set: { totalAmountDue: newTotal, balance: newBalance, status: newStatus }
            });
            console.log('AFTER REVERT INVOICE:', { newTotal, newBalance, newStatus });
        }
    }

    await DebitNote.findByIdAndDelete(targetId);
    console.log(`DELETED DEBIT NOTE ${note.debitNoteNumber} SUCCESSFUL.`);

    const remainingCount = await DebitNote.countDocuments();
    console.log('REMAINING DEBIT NOTES COUNT IN DB:', remainingCount);

    process.exit(0);
}).catch(err => { console.error('DELETE ERROR:', err); process.exit(1); });

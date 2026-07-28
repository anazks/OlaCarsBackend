const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
        const { autoSetOffInvoices } = require('../Src/modules/BankAccount/Service/BankAccountService');

        // Find a customer with an open invoice
        const openInvoice = await Invoice.findOne({ status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }).populate('customer');
        
        if (openInvoice) {
            console.log(`Found open invoice: ${openInvoice.invoiceNumber} | Customer: ${openInvoice.customer?.name} | Balance Due: $${openInvoice.balance || openInvoice.totalAmountDue}`);
            
            const custId = openInvoice.customer._id || openInvoice.customer;
            const bankAccCode = await AccountingCode.findOne({ code: '1.1.02-1' });

            console.log('\n--- Simulating Customer Receipt with Open Invoice ($80 receipt vs invoice balance) ---');
            const result = await autoSetOffInvoices(custId, 80, {
                bankAccountingCodeId: bankAccCode._id,
                entryDate: new Date(),
                description: 'Test Receipt Setoff',
                transactionId: 'TEST-RECPT-001'
            });

            console.log('\nSet-off result:', result);

            // Fetch created Manual Journal & Ledger Entries
            const lastJournal = await ManualJournal.findOne().sort({ createdAt: -1 });
            console.log(`\nCreated Journal ID: ${lastJournal._id}`);
            
            const entries = await LedgerEntry.find({ manualJournal: lastJournal._id }).populate('accountingCode');
            console.log(`\nCreated Ledger Entries (${entries.length} legs):`);
            for (const le of entries) {
                console.log(`  * Code: ${le.accountingCode?.code} (${le.accountingCode?.name}) | Type: ${le.type} | Amount: $${le.amount}`);
            }
        } else {
            console.log('No open invoice found in database to test.');
        }

    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        mongoose.disconnect();
    }
});

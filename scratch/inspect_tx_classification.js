const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

// Register models
require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Supplier/Model/SupplierModel');

async function inspectTransactions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');

        const bankAccounts = await BankAccount.find({ isDeleted: { $ne: true } });
        const bankAccCodeIds = new Set(bankAccounts.map(b => String(b.accountingCode)));

        const sampleEntries = await LedgerEntry.find({ isDeleted: { $ne: true } })
            .limit(10)
            .populate('accountingCode', 'code name category accountType')
            .populate('contact', 'name customerId driver driverId')
            .populate('supplier', 'name companyName supplierId');

        console.log(`\nSample Transactions Inspection (Total Bank Accounts: ${bankAccounts.length}):`);
        sampleEntries.forEach((e, idx) => {
            const isContactDriver = e.contact && (e.contact.driver || e.contact.driverId);
            const accCodeId = String(e.accountingCode?._id || e.accountingCode || '');
            const isBankCode = bankAccCodeIds.has(accCodeId);

            console.log(`\n[${idx + 1}] ID: ${e._id}, Type: ${e.type}, Amount: ${e.amount}`);
            console.log(`    Desc: "${e.description}"`);
            console.log(`    AccCode: ${e.accountingCode?.code} - ${e.accountingCode?.name} (Cat: ${e.accountingCode?.category}, AccType: ${e.accountingCode?.accountType}), isBankCode: ${isBankCode}`);
            console.log(`    ContactModel: ${e.contactModel}, ContactName: ${e.contact?.name || 'N/A'}, isDriver: ${isContactDriver}`);
            console.log(`    SupplierName: ${e.supplier?.name || e.supplier?.companyName || 'N/A'}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

inspectTransactions();

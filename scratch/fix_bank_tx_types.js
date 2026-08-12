const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Supplier/Model/SupplierModel');
require('../Src/modules/Ledger/Model/LedgerEntryModel');
require('../Src/modules/BankAccount/Model/BankAccountModel');

async function checkAndFixBankTxTypes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const LedgerEntry = mongoose.model('LedgerEntry');
        const BankAccount = mongoose.model('BankAccount');

        const bankAccounts = await BankAccount.find({ isDeleted: { $ne: true } });
        const bankAccountingCodeIds = new Set(bankAccounts.map(b => String(b.accountingCode)));

        // Find entries where bankTxType is NON_DRIVER_CUSTOMER
        const entries = await LedgerEntry.find({ bankTxType: 'NON_DRIVER_CUSTOMER', isDeleted: { $ne: true } })
            .populate('accountingCode')
            .populate('contact')
            .populate('supplier');

        console.log(`Found ${entries.length} entries with bankTxType = NON_DRIVER_CUSTOMER`);

        let fixedToInterBank = 0;
        let fixedToVendor = 0;
        let fixedToNull = 0;

        for (const entry of entries) {
            const hasCustomer = Boolean(entry.contact || entry.contactModel === 'Customer');
            if (hasCustomer) continue; // Legitimate customer entry

            // No customer attached!
            const primaryCodeId = String(entry.accountingCode?._id || entry.accountingCode || '');

            let isInterBank = false;
            if (entry.transactionId || entry.manualJournal) {
                const partnerConditions = [];
                if (entry.manualJournal) partnerConditions.push({ manualJournal: entry.manualJournal });
                if (entry.transactionId) partnerConditions.push({ transactionId: entry.transactionId });

                const partners = await LedgerEntry.find({
                    $or: partnerConditions,
                    _id: { $ne: entry._id }
                }).populate('accountingCode');

                isInterBank = partners.some(p => {
                    const codeId = String(p.accountingCode?._id || p.accountingCode || '');
                    const accType = p.accountingCode?.accountType;
                    const accName = p.accountingCode?.name || '';
                    return codeId !== primaryCodeId && (bankAccountingCodeIds.has(codeId) || accType === 'Bank' || accType === 'Cash' || /bank|banco/i.test(accName));
                });
            }

            if (!isInterBank && entry.description && /inter-bank|transfer.*bank|transferencia.*banco|bhd|nab|westpac|anz/i.test(entry.description)) {
                isInterBank = true;
            }

            if (isInterBank) {
                entry.bankTxType = 'INTER_BANK';
                await entry.save();
                fixedToInterBank++;
            } else if (entry.supplier || entry.contactModel === 'Supplier') {
                entry.bankTxType = 'VENDOR';
                await entry.save();
                fixedToVendor++;
            } else {
                entry.bankTxType = undefined;
                await entry.save();
                fixedToNull++;
            }
        }

        console.log(`Fix completed!`);
        console.log(`Fixed to INTER_BANK: ${fixedToInterBank}`);
        console.log(`Fixed to VENDOR: ${fixedToVendor}`);
        console.log(`Cleared misclassified NON_DRIVER_CUSTOMER: ${fixedToNull}`);

    } catch (err) {
        console.error('Error during checkAndFixBankTxTypes:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkAndFixBankTxTypes();

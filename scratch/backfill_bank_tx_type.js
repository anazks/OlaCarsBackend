const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Supplier/Model/SupplierModel');
require('../Src/modules/Ledger/Model/LedgerEntryModel');
require('../Src/modules/BankAccount/Model/BankAccountModel');
require('../Src/modules/BankAccount/Model/InvoiceBillSetOffHistoryModel');

async function backfillBankTxType() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for bankTxType backfill');

        const LedgerEntry = mongoose.model('LedgerEntry');
        const BankAccount = mongoose.model('BankAccount');
        const Customer = mongoose.model('Customer');
        const InvoiceBillSetOffHistory = mongoose.model('InvoiceBillSetOffHistory');

        const bankAccounts = await BankAccount.find({ isDeleted: { $ne: true } });
        const bankAccountingCodeIds = new Set(bankAccounts.map(b => String(b.accountingCode)));

        const allEntries = await LedgerEntry.find({ isDeleted: { $ne: true } })
            .populate('accountingCode')
            .populate('contact')
            .populate('supplier');

        console.log(`Found ${allEntries.length} total ledger entries to process.`);

        let updatedCount = 0;
        const counts = { DRIVER: 0, VENDOR: 0, INTER_BANK: 0, NON_DRIVER_CUSTOMER: 0 };

        for (const entry of allEntries) {
            let assignedType = "NON_DRIVER_CUSTOMER";

            const hasSupplier = Boolean(
                entry.supplier ||
                entry.contactModel === "Supplier"
            );

            const primaryCodeId = String(entry.accountingCode?._id || entry.accountingCode || '');

            // Check setOffHistory for this entry
            const historyDoc = await InvoiceBillSetOffHistory.findOne({
                $or: [
                    { primaryLedgerEntry: entry._id },
                    { partnerLedgerEntries: entry._id },
                    { transactionId: entry.transactionId }
                ]
            });

            if (historyDoc && historyDoc.targetType === "SUPPLIER") {
                assignedType = "VENDOR";
            } else if (hasSupplier) {
                assignedType = "VENDOR";
            } else {
                // Check for Inter-Bank partner leg
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
                        return (bankAccountingCodeIds.has(codeId) || accType === "Bank" || accType === "Cash") && codeId !== primaryCodeId;
                    });
                }

                if (!isInterBank && entry.description && /inter-bank|transfer.*bank|transferencia.*banco/i.test(entry.description)) {
                    isInterBank = true;
                }

                if (isInterBank) {
                    assignedType = "INTER_BANK";
                } else {
                    let isDriver = false;
                    if (entry.contact) {
                        const c = entry.contact;
                        if (c.driver || c.driverId || c.isDriver) {
                            isDriver = true;
                        }
                    }
                    if (historyDoc && historyDoc.targetType === "CUSTOMER") {
                        isDriver = true;
                    }
                    if (entry.description && /driver|conductor|chofer/i.test(entry.description)) {
                        isDriver = true;
                    }

                    if (isDriver) {
                        assignedType = "DRIVER";
                    } else if (entry.contact || entry.contactModel === "Customer") {
                        assignedType = "NON_DRIVER_CUSTOMER";
                    } else {
                        assignedType = entry.type === "CREDIT" ? "VENDOR" : "DRIVER";
                    }
                }
            }

            entry.bankTxType = assignedType;
            await entry.save();

            updatedCount++;
            counts[assignedType] = (counts[assignedType] || 0) + 1;
        }

        console.log(`Successfully backfilled bankTxType on ${updatedCount} entries!`);
        console.log('Breakdown:', counts);

    } catch (err) {
        console.error('Error during backfill:', err);
    } finally {
        await mongoose.disconnect();
    }
}

backfillBankTxType();

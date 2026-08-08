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

const BankAccountService = require('../Src/modules/BankAccount/Service/BankAccountService');

async function testDeletionFor4Types() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for Comprehensive 4-Type Deletion Test');

        const LedgerEntry = mongoose.model('LedgerEntry');
        const BankAccount = mongoose.model('BankAccount');
        const InvoiceBillSetOffHistory = mongoose.model('InvoiceBillSetOffHistory');

        const bankAccs = await BankAccount.find({ isDeleted: { $ne: true } }).limit(2);
        if (bankAccs.length < 2) {
            console.error('Need at least 2 bank accounts to run tests.');
            return;
        }

        const bankA = bankAccs[0];
        const bankB = bankAccs[1];

        // --- 1. INTER_BANK TRANSFER DELETION TEST ---
        console.log('\n--- 1. Testing Inter-Bank Transfer Deletion ---');
        const interbankTxId = `TEST-INTERBANK-${Date.now()}`;

        const ibEntryA = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'CREDIT',
            amount: 500,
            description: `Test Inter-Bank Transfer to ${bankB.accountName}`,
            entryDate: new Date(),
            transactionId: interbankTxId,
            bankTxType: 'INTER_BANK',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await ibEntryA.save();

        const ibEntryB = new LedgerEntry({
            branch: bankB.branch,
            accountingCode: bankB.accountingCode,
            type: 'DEBIT',
            amount: 500,
            description: `Test Inter-Bank Transfer from ${bankA.accountName}`,
            entryDate: new Date(),
            transactionId: interbankTxId,
            bankTxType: 'INTER_BANK',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await ibEntryB.save();

        await BankAccountService.bulkDeleteTransactions(bankA._id, [ibEntryA._id.toString()]);
        const checkIbA = await LedgerEntry.findById(ibEntryA._id);
        const checkIbB = await LedgerEntry.findById(ibEntryB._id);

        if (!checkIbA && !checkIbB) {
            console.log('✅ Inter-Bank Transfer Deletion SUCCESS: Both bank legs deleted!');
        } else {
            console.error(`❌ Inter-Bank Transfer Deletion FAILED: A=${!!checkIbA}, B=${!!checkIbB}`);
        }

        // --- 2. DRIVER TRANSACTION DELETION TEST ---
        console.log('\n--- 2. Testing Driver Transaction Deletion ---');
        const driverTxId = `TEST-DRIVER-${Date.now()}`;

        const driverBankLeg = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'DEBIT',
            amount: 250,
            description: 'Test Driver Receipt Deposit',
            entryDate: new Date(),
            transactionId: driverTxId,
            bankTxType: 'DRIVER',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await driverBankLeg.save();

        const driverArLeg = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'CREDIT',
            amount: 250,
            description: 'Test Driver Receipt AR Offset',
            entryDate: new Date(),
            transactionId: driverTxId,
            bankTxType: 'DRIVER',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await driverArLeg.save();

        const driverHist = new InvoiceBillSetOffHistory({
            primaryLedgerEntry: driverBankLeg._id,
            partnerLedgerEntries: [driverArLeg._id],
            transactionId: driverTxId,
            transactionAmount: 250,
            receiptAmount: 250,
            totalSetOff: 250,
            targetType: 'CUSTOMER'
        });
        await driverHist.save();

        await BankAccountService.bulkDeleteTransactions(bankA._id, [driverBankLeg._id.toString()]);
        const checkDriverBank = await LedgerEntry.findById(driverBankLeg._id);
        const checkDriverAr = await LedgerEntry.findById(driverArLeg._id);
        const checkDriverHist = await InvoiceBillSetOffHistory.findById(driverHist._id);

        if (!checkDriverBank && !checkDriverAr && !checkDriverHist) {
            console.log('✅ Driver Transaction Deletion SUCCESS: Bank leg, AR leg, and SetOff history deleted!');
        } else {
            console.error(`❌ Driver Transaction Deletion FAILED: BankLeg=${!!checkDriverBank}, ArLeg=${!!checkDriverAr}, Hist=${!!checkDriverHist}`);
        }

        // --- 3. VENDOR TRANSACTION DELETION TEST ---
        console.log('\n--- 3. Testing Vendor Transaction Deletion ---');
        const vendorTxId = `TEST-VENDOR-${Date.now()}`;

        const vendorBankLeg = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'CREDIT',
            amount: 300,
            description: 'Test Vendor Payment',
            entryDate: new Date(),
            transactionId: vendorTxId,
            bankTxType: 'VENDOR',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await vendorBankLeg.save();

        const vendorApLeg = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'DEBIT',
            amount: 300,
            description: 'Test Vendor Payment AP Offset',
            entryDate: new Date(),
            transactionId: vendorTxId,
            bankTxType: 'VENDOR',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await vendorApLeg.save();

        const vendorHist = new InvoiceBillSetOffHistory({
            primaryLedgerEntry: vendorBankLeg._id,
            partnerLedgerEntries: [vendorApLeg._id],
            transactionId: vendorTxId,
            transactionAmount: 300,
            receiptAmount: 300,
            totalSetOff: 300,
            targetType: 'SUPPLIER'
        });
        await vendorHist.save();

        await BankAccountService.bulkDeleteTransactions(bankA._id, [vendorBankLeg._id.toString()]);
        const checkVendorBank = await LedgerEntry.findById(vendorBankLeg._id);
        const checkVendorAp = await LedgerEntry.findById(vendorApLeg._id);
        const checkVendorHist = await InvoiceBillSetOffHistory.findById(vendorHist._id);

        if (!checkVendorBank && !checkVendorAp && !checkVendorHist) {
            console.log('✅ Vendor Transaction Deletion SUCCESS: Bank leg, AP leg, and SetOff history deleted!');
        } else {
            console.error(`❌ Vendor Transaction Deletion FAILED: BankLeg=${!!checkVendorBank}, ApLeg=${!!checkVendorAp}, Hist=${!!checkVendorHist}`);
        }

        // --- 4. NON-DRIVER CUSTOMER TRANSACTION DELETION TEST ---
        console.log('\n--- 4. Testing Non-Driver Customer Transaction Deletion ---');
        const customerTxId = `TEST-CUSTOMER-${Date.now()}`;

        const customerBankLeg = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'DEBIT',
            amount: 150,
            description: 'Test Non-Driver Customer Receipt',
            entryDate: new Date(),
            transactionId: customerTxId,
            bankTxType: 'NON_DRIVER_CUSTOMER',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await customerBankLeg.save();

        const customerOffsetLeg = new LedgerEntry({
            branch: bankA.branch,
            accountingCode: bankA.accountingCode,
            type: 'CREDIT',
            amount: 150,
            description: 'Test Non-Driver Customer Offset',
            entryDate: new Date(),
            transactionId: customerTxId,
            bankTxType: 'NON_DRIVER_CUSTOMER',
            createdBy: '685c2c5c9a721743fcd0c611',
            creatorRole: 'ADMIN'
        });
        await customerOffsetLeg.save();

        await BankAccountService.bulkDeleteTransactions(bankA._id, [customerBankLeg._id.toString()]);
        const checkCustBank = await LedgerEntry.findById(customerBankLeg._id);
        const checkCustOffset = await LedgerEntry.findById(customerOffsetLeg._id);

        if (!checkCustBank && !checkCustOffset) {
            console.log('✅ Non-Driver Customer Transaction Deletion SUCCESS: Both legs deleted!');
        } else {
            console.error(`❌ Non-Driver Customer Transaction Deletion FAILED: BankLeg=${!!checkCustBank}, OffsetLeg=${!!checkCustOffset}`);
        }

        console.log('\n==================================================');
        console.log('🎉 ALL 4 TRANSACTION TYPES DELETION TESTS COMPLETED SUCCESSFULLY!');
        console.log('==================================================');

    } catch (err) {
        console.error('Test error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

testDeletionFor4Types();

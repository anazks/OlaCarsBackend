const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function run() {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri.trim());
    console.log('Connected!');

    const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
    const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
    const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const controller = require('../Src/modules/BankAccount/Controller/BankAccountController');

    // 1. Let's create a dedicated test bank account
    const testAccountNumber = '999999999';
    await BankAccount.deleteMany({ accountNumber: testAccountNumber });
    
    let accCode = await AccountingCode.findOne({});
    if (!accCode) {
        accCode = new AccountingCode({
            code: '91101',
            name: 'Banco General',
            type: 'Asset',
            classification: 'Cash & Cash Equivalents',
            category: 'Cash',
            createdBy: new mongoose.Types.ObjectId('608d7e431b9b48abb30e4307'),
            creatorRole: 'ADMIN'
        });
        await accCode.save();
    }
    
    const account = new BankAccount({
        bankName: 'Banco General',
        accountNumber: testAccountNumber,
        accountHolderName: 'Ola Cars Test Account',
        accountName: 'Banco General AH 1601',
        accountCode: 'BA-TEST-99',
        initialBalance: 1000,
        currentBalance: 1000,
        accountingCode: accCode._id
    });
    await account.save();

    console.log(`Using Bank Account: Name="${account.accountName}", BankName="${account.bankName}", Number="${account.accountNumber}"`);

    // Let's ensure accounting code is linked and exists
    let accountingCodeDoc = await AccountingCode.findById(account.accountingCode);
    if (!accountingCodeDoc) {
        accountingCodeDoc = new AccountingCode({
            _id: account.accountingCode,
            code: '1101',
            name: 'Banco General',
            type: 'Asset',
            classification: 'Cash & Cash Equivalents'
        });
        await accountingCodeDoc.save();
    }

    // 2. Prepare test transactions
    // Scenario A: Correct bank name, correct receipt (debit), prefix & number
    // Scenario B: Mismatched bank name (should return 400 error)
    // Scenario C: Correct bank name, payment (credit), prefix & number
    const validTransactions = [
        {
            DATE: '2026-06-01',
            PREFIX: '2026',
            NUMBER: '0000001',
            'BANK NAME': 'Banco General AH 1601',
            'ACCOUNTS NAME': 'JESSICA SOTO EU8783',
            RECEIPT: 100.00,
            PAYMENT: 0.00,
            DESCRIPTION: 'ACH - JESSICA VALERIA SOTO CASTRO',
            REMARKS: 'JESSICA SOTO EU8783',
            BRANCH: 'HEAD OFFICE'
        },
        {
            DATE: '2026-06-02',
            PREFIX: '2026',
            NUMBER: '0000002',
            'BANK NAME': 'Banco General', // Partial match, should be fine
            'ACCOUNTS NAME': 'JOHN DOE',
            RECEIPT: 0.00,
            PAYMENT: 50.00,
            DESCRIPTION: 'Office Supplies',
            REMARKS: 'Payment for supplies',
            BRANCH: 'HEAD OFFICE'
        }
    ];

    const mismatchedTransactions = [
        {
            DATE: '2026-06-01',
            PREFIX: '2026',
            NUMBER: '0000001',
            'BANK NAME': 'Mismatched Bank PLC', // Should trigger error
            'ACCOUNTS NAME': 'JESSICA SOTO EU8783',
            RECEIPT: 100.00,
            PAYMENT: 0.00,
            DESCRIPTION: 'ACH - JESSICA VALERIA SOTO CASTRO',
            REMARKS: 'JESSICA SOTO EU8783',
            BRANCH: 'HEAD OFFICE'
        }
    ];

    // Helper to run controller mock req/res
    const testUpload = async (transactionsList, clearExisting) => {
        let statusVal = 0;
        let responseJson = null;

        const req = {
            params: { id: account._id.toString() },
            body: {
                branchId: null,
                transactions: transactionsList,
                clearExisting: clearExisting
            },
            user: { _id: '608d7e431b9b48abb30e4307', role: 'ADMIN' }
        };

        const res = {
            status: function(code) {
                statusVal = code;
                return this;
            },
            json: function(obj) {
                responseJson = obj;
                return this;
            }
        };

        const next = (err) => {
            console.error('Controller next() called with error:', err);
        };

        await controller.bulkUploadTransactions(req, res, next);
        return { status: statusVal || 200, response: responseJson };
    };

    console.log('\n--- Test 1: Mismatched Bank Name ---');
    const test1 = await testUpload(mismatchedTransactions, true);
    console.log('Result Status:', test1.status);
    console.log('Result Response:', test1.response);

    if (test1.status === 400 && test1.response.success === false) {
        console.log('✅ Test 1 Passed: Bank name mismatch correctly caught!');
    } else {
        console.error('❌ Test 1 Failed: Bank name mismatch was not caught!');
    }

    console.log('\n--- Test 2: Valid Transactions ---');
    // Clear existing for a clean run
    const test2 = await testUpload(validTransactions, true);
    console.log('Result Status:', test2.status);
    console.log('Result Response:', test2.response);

    if (test2.status === 200 && test2.response.success === true) {
        console.log('✅ Test 2 Passed: Valid transactions uploaded successfully!');
        
        // Fetch created entries to verify prefix+number combination and running balances
        const txs = await BankTransaction.find({ bankAccount: account._id }).sort({ entryDate: 1 });
        console.log('\n--- Database Verification ---');
        console.log(`Initial Account Balance: ${account.initialBalance}`);
        txs.forEach((t, i) => {
            console.log(`Transaction #${i+1}:`);
            console.log(` - ID: ${t.transactionId} (Expected Combination of PREFIX & NUMBER)`);
            console.log(` - Type: ${t.type} (Expected DEBIT/CREDIT polarity)`);
            console.log(` - Amount: ${t.amount}`);
            console.log(` - Running Balance: ${t.runningBalance} (Expected running balance calculation)`);
        });

        // Verify the account currentBalance
        const updatedAccount = await BankAccount.findById(account._id);
        console.log(`Updated Account Current Balance in DB: ${updatedAccount.currentBalance}`);
    } else {
        console.error('❌ Test 2 Failed:', test2.response);
    }

    console.log('\nCleaning up test data...');
    await BankAccount.deleteMany({ accountNumber: testAccountNumber });
    await BankTransaction.deleteMany({ bankAccount: account._id });
    await LedgerEntry.deleteMany({ accountingCode: accCode._id });

    console.log('Disconnecting...');
    await mongoose.disconnect();
}

run().catch(console.error);

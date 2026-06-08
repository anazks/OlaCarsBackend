const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const accounts = await BankAccount.find({}).populate('accountingCode');
    console.log(JSON.stringify(accounts.map(a => ({
        id: a._id,
        bankName: a.bankName,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        accountCode: a.accountCode,
        accountType: a.accountType,
        currency: a.currency,
        currentBalance: a.currentBalance,
        accountingCode: a.accountingCode ? {
            code: a.accountingCode.code,
            name: a.accountingCode.name
        } : null
    })), null, 2));
    process.exit(0);
}
run();

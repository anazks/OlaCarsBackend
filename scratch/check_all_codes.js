const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function checkAllCodes() {
    await mongoose.connect(process.env.MONGO_URI);
    const codes = await AccountingCode.find({});
    console.log('All Accounting Codes in DB:');
    codes.forEach(c => console.log(`${c.code}: ${c.name} (${c.category}) | Active: ${c.isActive} | Deleted: ${c.isDeleted}`));
    process.exit(0);
}

checkAllCodes();

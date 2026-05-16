const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function checkCodes() {
    await mongoose.connect(process.env.MONGO_URI);
    const codes = await AccountingCode.find({ isDeleted: false });
    console.log('Available Accounting Codes:');
    codes.forEach(c => console.log(`${c.code}: ${c.name} (${c.category})`));
    process.exit(0);
}

checkCodes();

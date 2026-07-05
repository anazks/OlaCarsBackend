const mongoose = require('mongoose');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const codes = await AccountingCode.find({ name: /BCT/i, isDeleted: false });
    console.log("MATCHING CODES:");
    console.log(JSON.stringify(codes, null, 2));
    await mongoose.disconnect();
}
run().catch(console.error);

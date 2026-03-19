const mongoose = require('mongoose');
const AccountingCode = require('./Src/modules/AccountingCode/Model/AccountingCodeModel');
require('dotenv').config();

async function checkCodes() {
    await mongoose.connect(process.env.MONGO_URI);
    const counts = await AccountingCode.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    console.log('Accounting Code Counts by Category:');
    console.log(JSON.stringify(counts, null, 2));

    const bankCodes = await AccountingCode.find({ 
        name: { $regex: /bank|cash/i },
        isDeleted: false 
    });
    console.log('\nPotential Bank/Cash Codes:');
    console.log(JSON.stringify(bankCodes, null, 2));

    await mongoose.disconnect();
}

checkCodes().catch(console.error);

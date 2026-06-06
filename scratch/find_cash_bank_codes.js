const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const codes = await AccountingCode.find({
        $or: [
            { accountType: { $in: ['Cash', 'Bank'] } },
            { name: /cash|bank/i },
            { code: /^1\.1\.(01|02)/ }
        ]
    });
    console.log(JSON.stringify(codes.map(c => ({
        id: c._id,
        code: c.code,
        name: c.name,
        category: c.category,
        accountType: c.accountType
    })), null, 2));
    process.exit(0);
}
run();

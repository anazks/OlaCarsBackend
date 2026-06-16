const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
// We need an admin ID to seed. Let's find one.
const Admin = require('../Src/modules/Admin/Model/adminModel');

async function seedCodes() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const admin = await Admin.findOne({ role: 'ADMIN' });
    if (!admin) {
        console.error('No admin found to seed codes');
        process.exit(1);
    }

    const codes = [
        { code: "4010", name: "Workshop Service Income", category: "INCOME" },
        { code: "4020", name: "Repair & Maintenance Revenue", category: "INCOME" },
        { code: "4030", name: "Labour Charges Income", category: "INCOME" },
        { code: "4040", name: "Spare Parts Sales", category: "INCOME" },
        { code: "1100", name: "Cash on Hand", category: "ASSET" },
        { code: "1110", name: "Bank Balance", category: "ASSET" },
        { code: "2.1.01", name: "Accounts Payable", category: "LIABILITY" },
        { code: "5100", name: "Workshop Operating Expense", category: "EXPENSE" }
    ];

    for (const c of codes) {
        const exists = await AccountingCode.findOne({ code: c.code });
        if (!exists) {
            await AccountingCode.create({
                ...c,
                createdBy: admin._id,
                creatorRole: 'ADMIN'
            });
            console.log(`Seeded code: ${c.code}`);
        } else {
            console.log(`Code ${c.code} already exists`);
        }
    }
    process.exit(0);
}

seedCodes();

const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function fixAccountingCodes() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        // Fix Salary (Code 4000): should be EXPENSE
        const resSalary = await AccountingCode.updateOne(
            { code: "4000" },
            { $set: { category: "EXPENSE" } }
        );
        console.log("Updated Salary (4000):", resSalary);

        // Fix Rental Income (Code 4001): should be INCOME
        const resRental = await AccountingCode.updateOne(
            { code: "4001" },
            { $set: { category: "INCOME" } }
        );
        console.log("Updated Rental Income (4001):", resRental);

        // Fix Accounts Receivable (Code 1200): should be ASSET
        const resAR = await AccountingCode.updateOne(
            { code: "1200" },
            { $set: { category: "ASSET" } }
        );
        console.log("Updated Accounts Receivable (1200):", resAR);

        console.log("Fix complete!");
        process.exit(0);
    } catch (err) {
        console.error("Error running fix:", err);
        process.exit(1);
    }
}

fixAccountingCodes();

const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function undoFixAccountingCodes() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        // Undo Salary (Code 4000): change category back to INCOME
        const resSalary = await AccountingCode.updateOne(
            { code: "4000" },
            { $set: { category: "INCOME" } }
        );
        console.log("Reverted Salary (4000):", resSalary);

        // Undo Rental Income (Code 4001): change category back to EXPENSE
        const resRental = await AccountingCode.updateOne(
            { code: "4001" },
            { $set: { category: "EXPENSE" } }
        );
        console.log("Reverted Rental Income (4001):", resRental);

        // Undo Accounts Receivable (Code 1200): change category back to INCOME
        const resAR = await AccountingCode.updateOne(
            { code: "1200" },
            { $set: { category: "INCOME" } }
        );
        console.log("Reverted Accounts Receivable (1200):", resAR);

        console.log("Undo complete!");
        process.exit(0);
    } catch (err) {
        console.error("Error running undo:", err);
        process.exit(1);
    }
}

undoFixAccountingCodes();

const mongoose = require("mongoose");
require("dotenv").config();

async function checkCodes() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/olacars");
        console.log("Connected to MongoDB.");

        const AccountingCode = require("./Src/modules/AccountingCode/Model/AccountingCodeModel");
        const codes = await AccountingCode.find({ isDeleted: { $ne: true } }).select("code name category subCategory type");
        
        console.log(`\nFound ${codes.length} active Accounting Codes:`);
        codes.forEach(c => {
            console.log(`- Code: "${c.code}", Name: "${c.name}", Category: "${c.category}", Type: "${c.type}"`);
        });

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkCodes();

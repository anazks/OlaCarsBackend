require("dotenv").config();
const mongoose = require("mongoose");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const codes = await AccountingCode.find({
        isActive: true,
        isDeleted: false
    }).lean();

    console.log("All LIABILITY codes:");
    codes.forEach(c => {
        const cat = (c.category || '').toLowerCase().trim();
        const type = (c.accountType || '').toLowerCase().trim();
        if (cat.includes('liability') || cat.includes('liab') || cat.includes('payable') || cat.includes('tax') ||
            type.includes('liability') || type.includes('liab') || type.includes('payable') || type.includes('tax')) {
            console.log(`- Code: ${c.code}, Name: ${c.name}, Category: ${c.category}, AccountType: ${c.accountType}`);
        }
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();

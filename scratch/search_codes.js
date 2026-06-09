require("dotenv").config();
const mongoose = require("mongoose");

const searchCodes = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB...");
    const AccountingCode = mongoose.model("AccountingCode", new mongoose.Schema({}, { strict: false }), "accountingcodes");
    
    // Find all codes containing key terms
    const codes = await AccountingCode.find({
      $or: [
        { code: { $regex: /^(1\.1\.05|CGS|IN000)/i } },
        { name: { $regex: /(inventory|stock|purchase|cogs|sales|rental)/i } }
      ]
    });
    
    console.log("Found codes:");
    codes.forEach(c => {
      console.log(`Code: ${c.code} | Name: ${c.name} | Category: ${c.category} | ID: ${c._id}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

searchCodes();

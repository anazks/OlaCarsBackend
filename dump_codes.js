require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected...");
    const AccountingCode = mongoose.model("AccountingCode", new mongoose.Schema({}, { strict: false }), "accountingcodes");
    const codes = await AccountingCode.find({});
    console.log(JSON.stringify(codes, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

connectDB();

require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected...");
    const LedgerEntry = mongoose.model("LedgerEntry", new mongoose.Schema({}, { strict: false }), "ledgerentries");
    const entries = await LedgerEntry.find({}).limit(10);
    console.log("Ledger entries count:", await LedgerEntry.countDocuments());
    console.log(JSON.stringify(entries, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

connectDB();

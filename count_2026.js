require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const LedgerEntry = mongoose.model("LedgerEntry", new mongoose.Schema({}, { strict: false }), "ledgerentries");
    
    const start2026 = new Date("2026-01-01T00:00:00.000Z");
    const end2026 = new Date("2026-12-31T23:59:59.999Z");
    
    const count = await LedgerEntry.countDocuments({
        accountingCode: new mongoose.Types.ObjectId("6a280dab4f5923cd64ec316d"),
        entryDate: { $gte: start2026, $lte: end2026 }
    });
    
    const debitCount = await LedgerEntry.countDocuments({
        accountingCode: new mongoose.Types.ObjectId("6a280dab4f5923cd64ec316d"),
        type: "DEBIT",
        entryDate: { $gte: start2026, $lte: end2026 }
    });
    
    const creditCount = await LedgerEntry.countDocuments({
        accountingCode: new mongoose.Types.ObjectId("6a280dab4f5923cd64ec316d"),
        type: "CREDIT",
        entryDate: { $gte: start2026, $lte: end2026 }
    });
    
    console.log(`\n=================== 2026 TRANS COUNT ===================`);
    console.log(`Total 2026 Entries: ${count}`);
    console.log(`Total Debits: ${debitCount}`);
    console.log(`Total Credits: ${creditCount}`);
    console.log(`========================================================\n`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();

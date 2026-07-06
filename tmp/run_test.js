const mongoose = require("mongoose");
const path = require("path");

async function run() {
  try {
    // Load environment variables
    require("dotenv").config({ path: path.join(__dirname, "../.env") });
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";
    console.log("Connecting to Database:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Database connected successfully!");

    // Register models
    require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
    require("../Src/modules/Ledger/Model/LedgerEntryModel");
    
    const AccountingCode = mongoose.model("AccountingCode");
    const LedgerEntry = mongoose.model("LedgerEntry");

    // Find all bank/cash accounts
    const allBankCodes = await AccountingCode.find({ 
      $or: [
        { accountType: { $in: ['Cash', 'Bank'] } },
        { name: /cash|bank|banco/i },
        { category: 'ASSET' }
      ]
    });

    console.log(`Found ${allBankCodes.length} Cash/Bank/Asset accounts:`);
    for (const code of allBankCodes) {
      const entries = await LedgerEntry.find({ 
        accountingCode: code._id,
        entryDate: { $lte: new Date("2026-06-15T23:59:59.999Z") }
      }).sort({ entryDate: 1, createdAt: 1 });

      let systemBal = 0;
      const seen = new Set();
      let uniqueBal = 0;
      let dupCount = 0;

      for (const e of entries) {
        const amt = e.amount || 0;
        const sign = e.type === 'DEBIT' ? 1 : -1;
        systemBal += (amt * sign);

        const dateStr = new Date(e.entryDate).toISOString().split('T')[0];
        const uniqueKey = `${dateStr}_${e.type}_${amt}_${(e.description || '').toLowerCase().trim().slice(0, 100)}`;
        
        if (seen.has(uniqueKey)) {
          dupCount++;
        } else {
          seen.add(uniqueKey);
          uniqueBal += (amt * sign);
        }
      }

      console.log(`- Account: "${code.name}" (${code.code})`);
      console.log(`  System Balance: ${systemBal.toFixed(2)}`);
      console.log(`  Unique Balance: ${uniqueBal.toFixed(2)}`);
      console.log(`  Total Entries: ${entries.length}, Duplicates: ${dupCount}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Execution failed:", err);
    process.exit(1);
  }
}

run();

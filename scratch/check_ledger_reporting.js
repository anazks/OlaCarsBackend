require("dotenv").config();
const mongoose = require("mongoose");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB...");
    const entries = await LedgerEntry.find({}).populate("accountingCode");
    
    console.log("Total entries:", entries.length);
    
    const sampleIncorrect = [];
    const reportData = {
      income: {},
      expenses: {},
      assets: {},
      liabilities: {},
      equity: {}
    };

    entries.forEach(entry => {
      const code = entry.accountingCode;
      if (!code) return;

      const amount = entry.amount || 0;
      const type = entry.type;
      
      let val = 0;
      if (code.category === "INCOME") {
        val = type === "CREDIT" ? amount : -amount;
        reportData.income[code.name] = (reportData.income[code.name] || 0) + val;
      } else if (code.category === "EXPENSE") {
        val = type === "DEBIT" ? amount : -amount;
        reportData.expenses[code.name] = (reportData.expenses[code.name] || 0) + val;
      } else if (code.category === "ASSET") {
        val = type === "DEBIT" ? amount : -amount;
        reportData.assets[code.name] = (reportData.assets[code.name] || 0) + val;
      } else if (code.category === "LIABILITY") {
        val = type === "CREDIT" ? amount : -amount;
        reportData.liabilities[code.name] = (reportData.liabilities[code.name] || 0) + val;
      } else if (code.category === "EQUITY") {
        val = type === "CREDIT" ? amount : -amount;
        reportData.equity[code.name] = (reportData.equity[code.name] || 0) + val;
      }

      if (val < 0) {
        sampleIncorrect.push({
          id: entry._id,
          codeName: code.name,
          category: code.category,
          type,
          amount,
          calculatedVal: val,
          description: entry.description
        });
      }
    });

    console.log("\n--- Calculated Report Values ---");
    console.log("Income:", reportData.income);
    console.log("Expenses:", reportData.expenses);
    console.log("Assets:", reportData.assets);
    console.log("Liabilities:", reportData.liabilities);
    console.log("Equity:", reportData.equity);

    console.log("\n--- Sample Entries resulting in Negative Values (First 5) ---");
    console.log(JSON.stringify(sampleIncorrect.slice(0, 5), null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();

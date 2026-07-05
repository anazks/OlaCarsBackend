const mongoose = require("mongoose");
const path = require("path");

async function run() {
  try {
    require("dotenv").config({ path: path.join(__dirname, "../.env") });
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";
    await mongoose.connect(mongoUri);

    require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
    require("../Src/modules/BankAccount/Model/BankAccountModel");
    require("../Src/modules/BankAccount/Model/BankTransactionModel");

    const BankAccount = mongoose.model("BankAccount");
    const BankTransaction = mongoose.model("BankTransaction");
    const AccountingCode = mongoose.model("AccountingCode");

    const accounts = await BankAccount.find({ isDeleted: false }).populate("accountingCode").lean();
    console.log(`Total bank accounts: ${accounts.length}`);
    
    for (const acc of accounts) {
      console.log(`\nAccount: "${acc.accountName || acc.bankName}" (${acc._id})`);
      console.log(`- Type: ${acc.accountType}`);
      console.log(`- Linked Accounting Code: ${acc.accountingCode ? `${acc.accountingCode.name} (${acc.accountingCode.code}) [${acc.accountingCode._id}]` : "NONE"}`);
      console.log(`- Initial Balance: ${acc.initialBalance}`);
      console.log(`- Current Balance: ${acc.currentBalance}`);
      
      const lastTx = await BankTransaction.findOne({ bankAccount: acc._id }).sort({ entryDate: -1, createdAt: -1 });
      console.log(`- Last Transaction in DB:`, lastTx ? {
        id: lastTx._id,
        entryDate: lastTx.entryDate,
        amount: lastTx.amount,
        type: lastTx.type,
        runningBalance: lastTx.runningBalance
      } : "NONE");
    }

    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();

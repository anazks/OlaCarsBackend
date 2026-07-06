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
    require("../Src/modules/BankAccount/Model/BankAccountModel");
    require("../Src/modules/BankAccount/Model/BankTransactionModel");

    const ReportingService = require("../Src/modules/Reporting/Service/ReportingService");

    console.log("Testing getBankBalanceSheetReport without bankAccount filter...");
    const allReport = await ReportingService.getBankBalanceSheetReport({
      endDate: "2026-07-04"
    });
    console.log("All accounts report summary:");
    console.log("- Cash Accounts:", allReport.cashAccounts.length, "Total balance:", allReport.cashTotal);
    console.log("- Bank Accounts:", allReport.bankAccounts.length, "Total balance:", allReport.bankTotal);
    console.log("- Grand Total:", allReport.grandTotal);

    // If there is any bank account, test with filter
    const bankAccount = allReport.bankAccounts[0] || allReport.cashAccounts[0];
    if (bankAccount) {
      console.log(`\nTesting with account filter: "${bankAccount.name}" (${bankAccount.id})`);
      const singleReport = await ReportingService.getBankBalanceSheetReport({
        bankAccount: bankAccount.id,
        startDate: "2026-01-01",
        endDate: "2026-07-04"
      });
      console.log("Single account report summary:");
      console.log("- Account Code:", singleReport.account.code);
      console.log("- Starting Balance:", singleReport.startingBalance);
      console.log("- Ending Balance:", singleReport.endingBalance);
      console.log("- Transactions Count:", singleReport.transactions.length);
      if (singleReport.transactions.length > 0) {
        console.log("- Sample transaction:", singleReport.transactions[0]);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("Execution failed:", err);
    process.exit(1);
  }
}

run();

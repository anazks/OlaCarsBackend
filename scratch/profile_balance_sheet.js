require("dotenv").config();
const mongoose = require("mongoose");
const ReportingService = require("../Src/modules/Reporting/Service/ReportingService");

const run = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    console.time("getBalanceSheetReport");
    const result = await ReportingService.getBalanceSheetReport({ endDate: '2026-06-15' });
    console.timeEnd("getBalanceSheetReport");

    console.log("Assets count:", result.assets.length);
    console.log("Liabilities count:", result.liabilities.length);
    console.log("Equity count:", result.equity.length);
    console.log("Assets total:", result.assetsTotal);
    console.log("Liabilities total:", result.liabilitiesTotal);
    console.log("Equity total:", result.equityTotal);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();

require("dotenv").config();
const mongoose = require("mongoose");
const { getBalanceSheetReport } = require("../Src/modules/Reporting/Service/ReportingService");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const report = await getBalanceSheetReport({
        endDate: "2026-06-15"
    });

    const otherLiability = report.liabilities.find(l => l.name === "Dimension Adjustments");
    console.log("\nDimension Adjustments balance sheet item:", otherLiability);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();

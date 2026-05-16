const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
require("../Src/modules/Branch/Model/BranchModel");
const { checkOverdueInvoices } = require("../Src/modules/Invoice/Service/InvoiceCronService");
const { runPeriodicVehicleChecks } = require("../Src/modules/Alert/Service/AlertService");
require("dotenv").config({ path: "../.env" });

const run = async () => {
    try {
        await connectDB();
        console.log("Connected to DB");
        
        console.log("Running checkOverdueInvoices...");
        await checkOverdueInvoices();
        console.log("checkOverdueInvoices done.");

        console.log("Running runPeriodicVehicleChecks...");
        await runPeriodicVehicleChecks();
        console.log("runPeriodicVehicleChecks done.");

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

run();

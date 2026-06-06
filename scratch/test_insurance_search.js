require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
require("../Src/modules/Vehicle/Model/VehicleModel");
require("../Src/modules/WorkOrder/Model/WorkOrderModel");
require("../Src/modules/Branch/Model/BranchModel");
const { InsuranceClaim } = require("../Src/modules/InsuranceClaim/Model/InsuranceClaimModel");

const { getClaims } = require("../Src/modules/InsuranceClaim/Repo/InsuranceClaimRepo");

async function run() {
    await connectDB();
    console.log("Connected to database successfully");

    const searchVal = "  ic-202605-0001  "; // Lowercase with leading/trailing spaces
    console.log(`Calling getClaims with search: "${searchVal}"`);
    const result = await getClaims({ search: searchVal });
    console.log("Result:", JSON.stringify(result, null, 2));

    await mongoose.connection.close();
}

run().catch(console.error);

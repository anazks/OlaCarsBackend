const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../.env") });

const { applyQueryFeatures } = require("../Src/shared/utils/queryHelper");

async function profile() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB.");
        
        // 1. Accounting Code Query with select and skipPopulate
        console.time("AccountingCode (Optimized)");
        const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
        const AccountingCodeService = require("../Src/modules/AccountingCode/Service/AccountingCodeService");
        
        // Let's call the actual service method with optimized parameters
        await AccountingCodeService.getAll({
            limit: 1000,
            select: "code,name",
            skipPopulate: "true"
        });
        console.timeEnd("AccountingCode (Optimized)");
        
        // 2. Vehicles query with select and skipPopulate
        console.time("Vehicles (Optimized)");
        const { getVehiclesService } = require("../Src/modules/Vehicle/Repo/VehicleRepo");
        await getVehiclesService({
            limit: 100,
            select: "basicDetails.make,basicDetails.model,legalDocs.registrationNumber",
            skipPopulate: "true"
        });
        console.timeEnd("Vehicles (Optimized)");
        
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

profile();

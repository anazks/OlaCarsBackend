// const axios = require("axios");

async function profile() {
    const baseUrl = "http://localhost:3000";
    
    // We need a valid token to call these endpoints. Let's find one or bypassauth if possible.
    // Wait, let's just inspect the backend database directly to see if any query is slow, 
    // or let's measure backend service calls directly without HTTP.
    
    const mongoose = require("mongoose");
    const dotenv = require("dotenv");
    const path = require("path");
    dotenv.config({ path: path.join(__dirname, "../.env") });
    
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB.");
        
        console.time("getFixedAssetTypes");
        const FixedAssetType = require("../Src/modules/FixedAsset/Model/FixedAssetTypeModel");
        await FixedAssetType.find({});
        console.timeEnd("getFixedAssetTypes");
        
        console.time("getAllAccountingCodes");
        const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
        await AccountingCode.find({ isDeleted: { $ne: true } }).limit(1000);
        console.timeEnd("getAllAccountingCodes");
        
        console.time("getAllVehicles");
        const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
        await Vehicle.find({}).limit(100);
        console.timeEnd("getAllVehicles");
        
        console.time("getAllBranches");
        const Branch = require("../Src/modules/Branch/Model/BranchModel");
        await Branch.find({ isDeleted: { $ne: true } }).limit(100);
        console.timeEnd("getAllBranches");
        
        console.time("getAllBills");
        const Bill = require("../Src/modules/Bill/Model/BillModel");
        await Bill.find({}).limit(50);
        console.timeEnd("getAllBills");
        
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

profile();

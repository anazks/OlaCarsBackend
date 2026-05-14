const mongoose = require('mongoose');
const { WorkOrder } = require('../Src/modules/WorkOrder/Model/WorkOrderModel');
const connectDB = require('../Src/config/dbConfig');
require('dotenv').config();

async function test() {
    await connectDB();
    console.log("Connected to DB");
    
    try {
        const dummyWO = {
            workOrderNumber: "TEST-" + Date.now(),
            workOrderType: "PREVENTIVE",
            vehicleId: new mongoose.Types.ObjectId(),
            branchId: new mongoose.Types.ObjectId(),
            faultDescription: "Test fault",
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "WORKSHOPMANAGER"
        };
        
        console.log("Attempting to create WorkOrder with creatorRole: WORKSHOPMANAGER");
        const wo = await WorkOrder.create(dummyWO);
        console.log("Success! Created WorkOrder:", wo._id);
    } catch (error) {
        console.error("Validation Failed!");
        console.error(error.message);
    } finally {
        await mongoose.connection.close();
    }
}

test();

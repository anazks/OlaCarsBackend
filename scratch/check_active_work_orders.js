const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    try {
        const uri = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";
        console.log("Connecting to:", uri);
        await mongoose.connect(uri);
        
        const WorkOrderSchema = new mongoose.Schema({}, { strict: false });
        const WorkOrder = mongoose.model("WorkOrder", WorkOrderSchema, "workorders");

        const aggregation = await WorkOrder.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log("WorkOrder Statuses Count in Database:", aggregation);

        const activeWOs = await WorkOrder.find({
            status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] },
            isDeleted: false
        });
        console.log(`Found ${activeWOs.length} active work orders:`);
        activeWOs.forEach(wo => {
            console.log(`- WO Number: ${wo.workOrderNumber}, Status: ${wo.status}, Vehicle ID: ${wo.vehicleId}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

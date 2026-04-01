const mongoose = require("mongoose");
const dotEnv = require("dotenv");
dotEnv.config();

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI).then(async () => {
    console.log("Connected to MongoDB");
    const workOrderId = "69cbb80ed99a70221a592cdf";
    const WorkOrder = mongoose.model("WorkOrder", new mongoose.Schema({}, { strict: false }));
    const wo = await WorkOrder.findById(workOrderId);
    if (wo) {
        console.log("Work Order Details:");
        console.log("-------------------");
        console.log("Status:", wo.status);
        console.log("Estimated Total Cost:", wo.estimatedTotalCost);
        console.log("Estimated Labour Hours:", wo.estimatedLabourHours);
        console.log("Estimated Parts Cost:", wo.estimatedPartsCost);
        console.log("Tasks:", JSON.stringify(wo.tasks, null, 2));
        console.log("Parts:", JSON.stringify(wo.parts, null, 2));
    } else {
        console.log("Work order not found");
    }
    process.exit(0);
}).catch(err => {
    console.error("Connection Error:", err);
    process.exit(1);
});

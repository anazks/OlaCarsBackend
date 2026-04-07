const mongoose = require("mongoose");
require("dotenv").config();
// No WorkOrder model import, use mongoose.model directly to avoid potential registration issues
const WO_ID = "69d37961825eeb36c9d86bf0";

const checkWO = async () => {
    try {
        console.log("Connecting to:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        
        // Define a minimal schema if model is not registered
        let WorkOrder;
        try {
            WorkOrder = mongoose.model("WorkOrder");
        } catch (e) {
            WorkOrder = mongoose.model("WorkOrder", new mongoose.Schema({}, { strict: false }));
        }

        const wo = await WorkOrder.findById(WO_ID);
        if (wo) {
            console.log("Work Order Found ID:", wo._id);
            console.log("Status:", wo.status);
            console.log("Number:", wo.workOrderNumber);
        } else {
            console.log("Work Order NOT FOUND in database.");
            // Just list some WOs to see if there are any
            const wos = await WorkOrder.find().limit(5);
            console.log("Available Work Order IDs in DB:", wos.map(w => w._id.toString()));
        }
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
};

checkWO();

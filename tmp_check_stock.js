const mongoose = require("mongoose");
require("dotenv").config();
const { InventoryPart } = require("./Src/modules/Inventory/Model/InventoryPartModel");
const WorkOrder = require("./Src/modules/WorkOrder/Model/WorkOrderModel");

async function checkStock() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const targetPartName = "bumperhondacity";
        const woId = "69d0ba9e16c3461590ee160e";

        // 1. Check Work Order Branch
        const wo = await mongoose.model("WorkOrder").findById(woId);
        if (!wo) {
            console.log("Work Order not found");
        } else {
            console.log(`Work Order Branch ID: ${wo.branchId}`);
        }

        // 2. Check Inventory Parts with that name
        const parts = await InventoryPart.find({ 
            partName: { $regex: targetPartName, $options: "i" } 
        });

        if (parts.length === 0) {
            console.log(`No parts found matching "${targetPartName}"`);
        } else {
            parts.forEach(p => {
                console.log(`--- Part found ---`);
                console.log(`ID: ${p._id}`);
                console.log(`Name: ${p.partName}`);
                console.log(`Number: ${p.partNumber}`);
                console.log(`Branch ID: ${p.branchId}`);
                console.log(`On Hand: ${p.quantityOnHand}`);
                console.log(`Reserved: ${p.quantityReserved}`);
                console.log(`Available: ${p.quantityOnHand - p.quantityReserved}`);
                console.log(`Is Active: ${p.isActive}`);
                
                if (wo && wo.branchId.toString() === p.branchId.toString()) {
                    console.log(">> MATCHES WORK ORDER BRANCH <<");
                } else {
                    console.log("!! DIFFERENT BRANCH !!");
                }
            });
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkStock();

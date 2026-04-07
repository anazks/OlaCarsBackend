const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { InventoryPart } = require("../Src/modules/Inventory/Model/InventoryPartModel");

const fixNegativeInventory = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI not found in .env");
        }
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const negativeParts = await InventoryPart.find({
            $or: [
                { quantityOnHand: { $lt: 0 } },
                { quantityReserved: { $lt: 0 } }
            ]
        });

        console.log(`Found ${negativeParts.length} parts with negative values.`);

        for (const part of negativeParts) {
            const oldHand = part.quantityOnHand;
            const oldReserved = part.quantityReserved;
            
            let updated = false;
            if (part.quantityOnHand < 0) {
                part.quantityOnHand = 0;
                updated = true;
            }
            if (part.quantityReserved < 0) {
                part.quantityReserved = 0;
                updated = true;
            }
            
            if (updated) {
                await part.save();
                console.log(`Fixed part ${part.partNumber}: Hand ${oldHand} -> ${part.quantityOnHand}, Reserved ${oldReserved} -> ${part.quantityReserved}`);
            }
        }

        console.log("Finished cleaning up negative inventory.");
    } catch (error) {
        console.error("Error fixing inventory:", error);
    } finally {
        await mongoose.disconnect();
    }
};

fixNegativeInventory();

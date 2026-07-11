require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");

// Schema to list
const InventoryPart = mongoose.model("InventoryPart", new mongoose.Schema({
    partName: String,
    partNumber: String,
    isActive: Boolean
}, { collection: "inventoryparts" }));

(async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        const parts = await InventoryPart.find({ isActive: { $ne: false } });
        console.log("Total parts:", parts.length);
        
        const uniqueNames = parts.map(p => p.partName);
        console.log("Part Names:\n", uniqueNames.join("\n"));
        
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
})();

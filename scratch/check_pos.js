const mongoose = require("mongoose");
const MONGO_URI = "mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsFresh?appName=Cluster0";

const run = async () => {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    const pos = await mongoose.connection.db.collection("purchaseorders").find().sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`Found ${pos.length} latest purchase orders:\n`);

    for (const po of pos) {
        console.log(`PO Number: ${po.purchaseOrderNumber}`);
        console.log(`Status: ${po.status}`);
        console.log(`Items count: ${po.items?.length || 0}`);
        if (po.items && po.items.length > 0) {
            po.items.forEach((item, index) => {
                console.log(`  - Item ${index + 1}: ${item.itemName} (Qty: ${item.quantity}, Price: ${item.unitPrice})`);
            });
        }
        console.log(`Description: ${po.description}`);
        console.log(`Total Amount: ${po.totalAmount}`);
        console.log(`Created At: ${po.createdAt}\n---------------------------------------\n`);
    }

    await mongoose.disconnect();
};

run().catch(console.error);

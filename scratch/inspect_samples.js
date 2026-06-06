const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    
    const sampleInvoices = await db.collection("ledgerentries").find({ description: { $regex: /^Invoice Created/ } }).limit(3).toArray();
    console.log("Invoice Created entries samples:", JSON.stringify(sampleInvoices, null, 2));

    const samplePayments = await db.collection("ledgerentries").find({ description: { $regex: /^Payment Received/ } }).limit(3).toArray();
    console.log("Payment Received entries samples:", JSON.stringify(samplePayments, null, 2));

    const sampleRedundant = await db.collection("ledgerentries").find({
        description: { $regex: /Payment/ },
        accountingCode: new mongoose.Types.ObjectId("69ba2d9a14667588d5bcc4ea") // Code for 4100 (Rental Income)
    }).limit(3).toArray();
    console.log("Redundant/other 4100 entries samples:", JSON.stringify(sampleRedundant, null, 2));

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

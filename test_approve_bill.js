const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
    console.log("Connected to MongoDB");
    
    // Explicitly require BranchModel
    require("./Src/modules/Branch/Model/BranchModel");

    const { approveBill } = require("./Src/modules/ServiceBill/Service/ServiceBillService");
    const { ServiceBill } = require("./Src/modules/ServiceBill/Model/ServiceBillModel");

    const recentBills = await ServiceBill.find().sort({ createdAt: -1 }).limit(1).lean();
    if (recentBills.length > 0) {
        console.log("Found bill:", recentBills[0]._id, "status:", recentBills[0].status);
        await ServiceBill.updateOne({ _id: recentBills[0]._id }, { status: "DRAFT" });
        console.log("Temporarily set to DRAFT.");

        try {
            const result = await approveBill(recentBills[0]._id, { id: "6a23f7777dc9702d975d675c", role: "WORKSHOPSTAFF" });
            console.log("Approve bill result:", result.invoiceNumber ? "Invoice generated!" : "No invoice generated!");
            if (!result.invoiceNumber) {
                console.log("Result object:", result);
            }
        } catch (err) {
            console.error("Error approving bill:", err);
        }
    } else {
        console.log("No bills found.");
    }
    
    await mongoose.disconnect();
    console.log("Done");
}

run().catch(err => { console.error(err); process.exit(1); });

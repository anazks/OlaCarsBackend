const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to database successfully!");

    // Require schemas to prevent mongoose model compilation errors
    require("../Src/modules/Branch/Model/BranchModel");
    const Bill = require("../Src/modules/Bill/Model/BillModel");

    const billsCount = await Bill.countDocuments();
    console.log("Total bills count in DB:", billsCount);

    const allBills = await Bill.find().limit(10).lean();
    console.log("Sample Bills from DB:");
    allBills.forEach(b => {
        console.log({
            id: b._id,
            billNumber: b.billNumber,
            billDate: b.billDate,
            dueDate: b.dueDate,
            totalAmount: b.totalAmount,
            amountPaid: b.amountPaid,
            balanceDue: b.balanceDue,
            status: b.status,
            branch: b.branch
        });
    });

    // Check if there are dates matching the default date filter
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const today = new Date();
    
    console.log(`Default range: ${oneMonthAgo.toISOString()} to ${today.toISOString()}`);
    const matchingBills = await Bill.find({
        billDate: { $gte: oneMonthAgo, $lte: today },
        status: { $nin: ["PAID", "VOID"] }
    });
    console.log("Matching bills count in range:", matchingBills.length);

    await mongoose.disconnect();
}

run().catch(console.error);

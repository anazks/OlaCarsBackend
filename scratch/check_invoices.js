const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function run() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";
        console.log("Connecting to:", mongoUri);
        await mongoose.connect(mongoUri);
        console.log("Connected successfully!");

        // Load Invoice Model
        const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
        
        const count = await Invoice.countDocuments();
        console.log(`Total Invoices: ${count}`);

        const statuses = await Invoice.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log("Invoice Statuses in DB:", statuses);

        const overdueDetails = await Invoice.find({
            status: { $ne: "PAID" },
            isDeleted: false
        })
        .limit(10)
        .lean();

        console.log("Sample Unpaid/Pending Invoices:");
        overdueDetails.forEach(inv => {
            console.log(`- Number: ${inv.invoiceNumber}, Status: ${inv.status}, Due: ${inv.dueDate}, Balance: ${inv.balance}`);
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

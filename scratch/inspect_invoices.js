const mongoose = require("mongoose");
require("dotenv").config();
// Register models so they can be populated
require("../Src/modules/Driver/Model/DriverModel");
require("../Src/modules/Vehicle/Model/VehicleModel");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const totalInvoices = await Invoice.countDocuments();
    console.log(`Total invoices in DB: ${totalInvoices}`);

    const latestInvoices = await Invoice.find().sort({ createdAt: -1 }).limit(10).populate('driver', 'personalInfo.fullName');
    console.log("\nLatest 10 invoices in DB:");
    latestInvoices.forEach(inv => {
        console.log(`- ID: ${inv._id}, Number: ${inv.invoiceNumber}, Driver: ${inv.driver?.personalInfo?.fullName || 'Unknown'}, generatedAt: ${inv.generatedAt}, createdAt: ${inv.createdAt}, isDeleted: ${inv.isDeleted}`);
    });

    const totalLedger = await LedgerEntry.countDocuments();
    console.log(`\nTotal ledger entries in DB: ${totalLedger}`);

    const latestLedgers = await LedgerEntry.find().sort({ createdAt: -1 }).limit(10);
    console.log("\nLatest 10 ledger entries in DB:");
    latestLedgers.forEach(led => {
        console.log(`- ID: ${led._id}, type: ${led.type}, amount: ${led.amount}, description: ${led.description}, entryDate: ${led.entryDate}, createdAt: ${led.createdAt}`);
    });

    await mongoose.disconnect();
}

main().catch(console.error);

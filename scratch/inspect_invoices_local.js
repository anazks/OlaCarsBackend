const mongoose = require("mongoose");
require("dotenv").config();
require("../Src/modules/Driver/Model/DriverModel");
require("../Src/modules/Vehicle/Model/VehicleModel");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    // Local timezone is GMT+05:30
    // So 2026-06-05 00:00:00 GMT+05:30 is 2026-06-04T18:30:00.000Z
    // And 2026-06-05 23:59:59.999 GMT+05:30 is 2026-06-05T18:29:59.999Z
    const startOfLocalDay = new Date("2026-06-04T18:30:00.000Z");
    const endOfLocalDay = new Date("2026-06-05T18:29:59.999Z");

    console.log(`Local Day bounds (GMT+05:30): ${startOfLocalDay.toISOString()} to ${endOfLocalDay.toISOString()}`);

    // Query invoices where createdAt is on local June 5, 2026
    const invoicesByCreatedAt = await Invoice.find({
        createdAt: {
            $gte: startOfLocalDay,
            $lte: endOfLocalDay
        }
    }).populate('driver', 'personalInfo.fullName');

    console.log(`\nInvoices matching createdAt on 2026-06-05 (GMT+05:30): ${invoicesByCreatedAt.length}`);
    if (invoicesByCreatedAt.length > 0) {
        console.log("Sample of first 5:");
        invoicesByCreatedAt.slice(0, 5).forEach(inv => {
            console.log(`- ID: ${inv._id}, Number: ${inv.invoiceNumber}, Driver: ${inv.driver?.personalInfo?.fullName || 'Unknown'}, generatedAt: ${inv.generatedAt}, createdAt: ${inv.createdAt}`);
        });
    }

    // Query invoices where generatedAt is on local June 5, 2026
    const invoicesByGeneratedAt = await Invoice.find({
        generatedAt: {
            $gte: startOfLocalDay,
            $lte: endOfLocalDay
        }
    }).populate('driver', 'personalInfo.fullName');

    console.log(`\nInvoices matching generatedAt on 2026-06-05 (GMT+05:30): ${invoicesByGeneratedAt.length}`);
    if (invoicesByGeneratedAt.length > 0) {
        console.log("Sample of first 5:");
        invoicesByGeneratedAt.slice(0, 5).forEach(inv => {
            console.log(`- ID: ${inv._id}, Number: ${inv.invoiceNumber}, Driver: ${inv.driver?.personalInfo?.fullName || 'Unknown'}, generatedAt: ${inv.generatedAt}, createdAt: ${inv.createdAt}`);
        });
    }

    // Let's also check ledger entries matching createdAt
    const ledgersByCreatedAt = await LedgerEntry.find({
        createdAt: {
            $gte: startOfLocalDay,
            $lte: endOfLocalDay
        }
    });
    console.log(`\nLedger entries matching createdAt on 2026-06-05 (GMT+05:30): ${ledgersByCreatedAt.length}`);

    // Let's also check ledger entries matching entryDate
    const ledgersByEntryDate = await LedgerEntry.find({
        entryDate: {
            $gte: startOfLocalDay,
            $lte: endOfLocalDay
        }
    });
    console.log(`Ledger entries matching entryDate on 2026-06-05 (GMT+05:30): ${ledgersByEntryDate.length}`);

    await mongoose.disconnect();
}

main().catch(console.error);

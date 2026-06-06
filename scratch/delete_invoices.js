const mongoose = require("mongoose");
require("dotenv").config();
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const startOfLocalDay = new Date("2026-06-04T18:30:00.000Z");
    const endOfLocalDay = new Date("2026-06-05T18:29:59.999Z");

    // 1. Find target invoices
    const targetInvoices = await Invoice.find({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay }
    });

    console.log(`Found ${targetInvoices.length} target invoices to delete.`);
    if (targetInvoices.length !== 299) {
        console.error(`Error: Expected 299 invoices, but found ${targetInvoices.length}. Aborting deletion.`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const invoiceNumbers = targetInvoices.map(i => i.invoiceNumber);
    const invoiceIds = targetInvoices.map(i => i._id);

    // 2. Find target ledger entries
    console.log("Searching for corresponding ledger entries...");
    const allLedgerEntries = await LedgerEntry.find({});
    const targetLedgerIds = [];

    allLedgerEntries.forEach(ledger => {
        for (const num of invoiceNumbers) {
            if (ledger.description && ledger.description.includes(num)) {
                targetLedgerIds.push(ledger._id);
                break;
            }
        }
    });

    console.log(`Found ${targetLedgerIds.length} corresponding ledger entries to delete.`);
    if (targetLedgerIds.length !== 598) {
        console.error(`Error: Expected 598 ledger entries, but found ${targetLedgerIds.length}. Aborting deletion.`);
        await mongoose.disconnect();
        process.exit(1);
    }

    // 3. Perform Deletion
    console.log("Deleting invoices...");
    const invoiceDeleteResult = await Invoice.deleteMany({ _id: { $in: invoiceIds } });
    console.log(`Successfully deleted ${invoiceDeleteResult.deletedCount} invoices.`);

    console.log("Deleting corresponding ledger entries...");
    const ledgerDeleteResult = await LedgerEntry.deleteMany({ _id: { $in: targetLedgerIds } });
    console.log(`Successfully deleted ${ledgerDeleteResult.deletedCount} ledger entries.`);

    // 4. Verification Check
    const remainingInvoicesCount = await Invoice.countDocuments({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay }
    });
    console.log(`Verification: Remaining target invoices matching filter: ${remainingInvoicesCount}`);

    let remainingLedgerCount = 0;
    const remainingLedgers = await LedgerEntry.find({});
    remainingLedgers.forEach(ledger => {
        for (const num of invoiceNumbers) {
            if (ledger.description && ledger.description.includes(num)) {
                remainingLedgerCount++;
            }
        }
    });
    console.log(`Verification: Remaining corresponding ledger entries matching invoice numbers: ${remainingLedgerCount}`);

    await mongoose.disconnect();
    console.log("Database connection closed. Operations completed successfully.");
}

main().catch(console.error);

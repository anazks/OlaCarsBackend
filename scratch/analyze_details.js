const mongoose = require("mongoose");
require("dotenv").config();
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const startOfLocalDay = new Date("2026-06-04T18:30:00.000Z");
    const endOfLocalDay = new Date("2026-06-05T18:29:59.999Z");

    // Group 1: Both created and generated on June 5 (299 invoices)
    const bothInvoices = await Invoice.find({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay }
    });

    const bothNumbers = bothInvoices.map(i => i.invoiceNumber);

    // Ledger entries for group 1 (by matching invoice number in description)
    let bothLedgerCount = 0;
    if (bothNumbers.length > 0) {
        // We match descriptions like "(INV: INV-007312)"
        // Let's count how many ledger entries match these invoice numbers
        bothLedgerCount = await LedgerEntry.countDocuments({
            $or: [
                { description: { $regex: /INV-007312|INV-007313|INV-007314/ } }, // just as check
                // Let's query using a regex or search for invoice numbers directly
            ]
        });
        
        // Let's do a more generic search for any ledger entries created on June 5
        // or check how many have description containing invoice numbers from this group
        let sampleNum = bothNumbers.slice(0, 5);
        console.log(`Sample invoice numbers from Group 1 (Both): ${sampleNum.join(", ")}`);
        
        const matchedLedgers = await LedgerEntry.find({
            description: { $regex: new RegExp(sampleNum.join("|")) }
        });
        console.log(`Matched ledger entries for those 5 sample invoices: ${matchedLedgers.length}`);
    }

    // Group 2: Created on June 5, but generated on another day (2044 invoices)
    const onlyCreatedInvoices = await Invoice.find({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $not: { $gte: startOfLocalDay, $lte: endOfLocalDay } }
    });

    const uniqueGeneratedDates = new Set();
    onlyCreatedInvoices.forEach(inv => {
        uniqueGeneratedDates.add(inv.generatedAt.toISOString().split('T')[0]);
    });

    console.log(`\nGroup 2 (Created on June 5, generated on another day):`);
    console.log(`- Total: ${onlyCreatedInvoices.length} invoices`);
    console.log(`- Unique generatedAt dates (first 10):`, Array.from(uniqueGeneratedDates).slice(0, 10));
    console.log(`- Sample invoice numbers:`, onlyCreatedInvoices.slice(0, 5).map(i => i.invoiceNumber).join(", "));

    await mongoose.disconnect();
}

main().catch(console.error);

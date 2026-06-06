const mongoose = require("mongoose");
require("dotenv").config();
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const startOfLocalDay = new Date("2026-06-04T18:30:00.000Z");
    const endOfLocalDay = new Date("2026-06-05T18:29:59.999Z");

    const targetInvoices = await Invoice.find({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay }
    });

    console.log(`Found ${targetInvoices.length} target invoices.`);

    // Check status counts
    const statusCounts = {};
    let totalPaymentsCount = 0;
    targetInvoices.forEach(inv => {
        statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
        if (inv.payments && inv.payments.length > 0) {
            totalPaymentsCount += inv.payments.length;
        }
    });
    console.log("Invoice status distribution:", statusCounts);
    console.log("Total payments recorded on invoice subdocuments:", totalPaymentsCount);

    // Let's check for PaymentReceived documents
    // Let's load the PaymentReceived model
    let PaymentReceived;
    try {
        PaymentReceived = require("../Src/modules/PaymentReceived/Model/PaymentReceivedModel");
    } catch (e) {
        console.log("PaymentReceived model not found at usual path, trying registration");
    }

    if (PaymentReceived) {
        const invoiceIds = targetInvoices.map(i => i._id);
        const relatedPRs = await PaymentReceived.find({
            "invoices.invoiceId": { $in: invoiceIds }
        });
        console.log(`Related PaymentReceived documents found: ${relatedPRs.length}`);
    }

    // Let's search for Ledger entries that match these invoice numbers
    const invoiceNumbers = targetInvoices.map(i => i.invoiceNumber);
    
    // We can query ledger entries whose description matches any invoiceNumber
    // Since there are 299 invoices, we can do a regex or batch query.
    // Let's count ledger entries where description contains the invoice numbers.
    let ledgerMatchesCount = 0;
    const allLedgerEntries = await LedgerEntry.find({});
    const matchedLedgerIds = [];

    allLedgerEntries.forEach(ledger => {
        for (const num of invoiceNumbers) {
            if (ledger.description && ledger.description.includes(num)) {
                matchedLedgerIds.push(ledger._id);
                break;
            }
        }
    });

    console.log(`Matched ledger entries via description check: ${matchedLedgerIds.length}`);

    await mongoose.disconnect();
}

main().catch(console.error);

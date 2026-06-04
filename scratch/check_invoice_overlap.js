const mongoose = require("mongoose");
require("dotenv").config();
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const startOfLocalDay = new Date("2026-06-04T18:30:00.000Z");
    const endOfLocalDay = new Date("2026-06-05T18:29:59.999Z");

    const onlyCreatedToday = await Invoice.countDocuments({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $not: { $gte: startOfLocalDay, $lte: endOfLocalDay } }
    });

    const onlyGeneratedToday = await Invoice.countDocuments({
        generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        createdAt: { $not: { $gte: startOfLocalDay, $lte: endOfLocalDay } }
    });

    const bothToday = await Invoice.countDocuments({
        createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
        generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay }
    });

    console.log(`Created on June 5, but generated on another day: ${onlyCreatedToday}`);
    console.log(`Generated on June 5, but created on another day: ${onlyGeneratedToday}`);
    console.log(`Both created AND generated on June 5: ${bothToday}`);

    // Let's print some examples of each
    if (onlyCreatedToday > 0) {
        const samples = await Invoice.find({
            createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
            generatedAt: { $not: { $gte: startOfLocalDay, $lte: endOfLocalDay } }
        }).limit(3);
        console.log("\nExamples of 'Created on June 5, but generated on another day':");
        samples.forEach(s => console.log(`- ${s.invoiceNumber}: generatedAt=${s.generatedAt}, createdAt=${s.createdAt}`));
    }

    if (bothToday > 0) {
        const samples = await Invoice.find({
            createdAt: { $gte: startOfLocalDay, $lte: endOfLocalDay },
            generatedAt: { $gte: startOfLocalDay, $lte: endOfLocalDay }
        }).limit(3);
        console.log("\nExamples of 'Both created AND generated on June 5':");
        samples.forEach(s => console.log(`- ${s.invoiceNumber}: generatedAt=${s.generatedAt}, createdAt=${s.createdAt}`));
    }

    await mongoose.disconnect();
}

main().catch(console.error);

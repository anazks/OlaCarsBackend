const connectDB = require("../Src/config/dbConfig");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function checkEntry() {
    await connectDB();
    const entry = await LedgerEntry.findById("6a9fe5669ef64e90c138e869").lean();
    console.log("Entry details:", entry);

    const sameCreated = await LedgerEntry.find({
        createdAt: {
            $gte: new Date("2026-09-08T10:37:00Z"),
            $lte: new Date("2026-09-08T10:38:00Z")
        }
    }).lean();

    console.log(`Entries created around that time count: ${sameCreated.length}`);
    sameCreated.forEach(e => console.log(e.description, e.amount, e.type, e.accountingCode, e.runningBalance));

    process.exit(0);
}

checkEntry();

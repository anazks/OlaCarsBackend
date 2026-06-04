const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Let's populate the accounting code to get its category
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));

    // Let's find some ledger entries
    const ledgerentries = await mongoose.connection.db.collection("ledgerentries").find().toArray();
    console.log(`Total ledger entries: ${ledgerentries.length}`);

    // Let's find accounting codes
    const accountingcodes = await mongoose.connection.db.collection("accountingcodes").find().toArray();
    const codeMap = new Map(accountingcodes.map(c => [c._id.toString(), c]));

    const incomeEntries = [];
    const otherCategories = {};

    for (const entry of ledgerentries) {
        const codeId = entry.accountingCode ? entry.accountingCode.toString() : null;
        const code = codeId ? codeMap.get(codeId) : null;
        const cat = code ? code.category.toUpperCase() : 'UNKNOWN';

        if (cat === 'INCOME') {
            incomeEntries.push({
                entry,
                code
            });
        } else {
            otherCategories[cat] = (otherCategories[cat] || 0) + 1;
        }
    }

    console.log("\nCounts of other category entries:", otherCategories);
    console.log(`Found ${incomeEntries.length} INCOME ledger entries.`);

    if (incomeEntries.length > 0) {
        console.log("\nSample Income Ledger Entries:");
        incomeEntries.slice(0, 15).forEach(({ entry, code }) => {
            console.log({
                _id: entry._id,
                date: entry.entryDate || entry.date,
                type: entry.type,
                amount: entry.amount,
                debit: entry.debit,
                credit: entry.credit,
                description: entry.description,
                codeName: code.name,
                codeCategory: code.category,
                codeCode: code.code
            });
        });

        // Let's sum up income under current logic
        let periodRev = 0;
        let debitSum = 0;
        let creditSum = 0;

        incomeEntries.forEach(({ entry, code }) => {
            let amt = entry.amount !== undefined ? entry.amount : (entry.debit || entry.credit || 0);
            let isDebit = entry.amount !== undefined ? entry.type === 'DEBIT' : ((entry.debit || 0) > 0);

            if (isDebit) {
                debitSum += amt;
                periodRev -= amt;
            } else {
                creditSum += amt;
                periodRev += amt;
            }
        });

        console.log("\nSummary of Income Entries:");
        console.log(`Total Debit Amount: ${debitSum}`);
        console.log(`Total Credit Amount: ${creditSum}`);
        console.log(`Computed Net Income under current UI logic: ${periodRev}`);
    }

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

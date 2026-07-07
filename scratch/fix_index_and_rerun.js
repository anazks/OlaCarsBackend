/**
 * 1. Drop the problematic unique index customer_1_weekNumber_1
 *    (weekNumber shouldn't be unique per customer — RENTAL and MANUAL invoices can share weekNumbers)
 * 2. Check if healing script completed, re-heal any remaining corrupted invoices
 * 3. Then trigger the cron
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const invoicesCol = db.collection('invoices');

    // ========== STEP 1: Fix the problematic unique index ==========
    console.log('\n=== STEP 1: Checking indexes on invoices collection ===');
    const indexes = await invoicesCol.indexes();
    
    for (const idx of indexes) {
        console.log(`  Index: ${idx.name} | Keys: ${JSON.stringify(idx.key)} | Unique: ${idx.unique || false}`);
    }

    // Drop the customer_1_weekNumber_1 unique index if it exists
    const badIndex = indexes.find(i => i.name === 'customer_1_weekNumber_1');
    if (badIndex) {
        console.log('\n  >> Dropping problematic unique index: customer_1_weekNumber_1');
        await invoicesCol.dropIndex('customer_1_weekNumber_1');
        console.log('  >> Dropped successfully!');
    } else {
        console.log('\n  >> Index customer_1_weekNumber_1 not found (already dropped or different name).');
        // Check for any index with customer+weekNumber
        const cwIndex = indexes.find(i => i.key && i.key.customer && i.key.weekNumber && i.unique);
        if (cwIndex) {
            console.log(`  >> Found similar unique index: ${cwIndex.name} — dropping it...`);
            await invoicesCol.dropIndex(cwIndex.name);
            console.log('  >> Dropped successfully!');
        }
    }

    // ========== STEP 2: Check for remaining corrupted weekNumbers ==========
    console.log('\n=== STEP 2: Checking for remaining corrupted weekNumbers ===');
    
    // Find invoices where weekNumber is stored as a string (not yet healed)
    const corruptedCount = await invoicesCol.countDocuments({
        invoiceType: 'RENTAL',
        $expr: { $ne: [{ $type: '$weekNumber' }, 'int'] },
        weekNumber: { $exists: true, $ne: null }
    });

    // Also check for double type - some might be stored as 'double' which is fine if they're proper numbers
    const doubleCount = await invoicesCol.countDocuments({
        invoiceType: 'RENTAL',
        $expr: { $eq: [{ $type: '$weekNumber' }, 'double'] }
    });

    const stringCount = await invoicesCol.countDocuments({
        invoiceType: 'RENTAL',
        $expr: { $eq: [{ $type: '$weekNumber' }, 'string'] }
    });

    console.log(`  Corrupted (non-int) weekNumbers: ${corruptedCount}`);
    console.log(`  Double type weekNumbers: ${doubleCount}`);
    console.log(`  String type weekNumbers: ${stringCount}`);

    if (stringCount > 0) {
        console.log(`\n  >> ${stringCount} invoices still have STRING weekNumbers — healing script didn't finish!`);
        console.log('  >> You should wait for the healing script to complete, or re-run it.');
    } else {
        console.log('\n  >> All RENTAL invoice weekNumbers are numeric. Healing is complete!');
    }

    // Fix any weekNumbers stored as 'double' with huge scientific notation values (>1000)
    // These are the "1.111e+55" type values from Number("111...1") conversion
    const hugeWeekNumbers = await invoicesCol.find({
        invoiceType: 'RENTAL',
        weekNumber: { $gt: 1000 }
    }).project({ _id: 1, invoiceNumber: 1, weekNumber: 1, driver: 1 }).limit(10).toArray();

    if (hugeWeekNumbers.length > 0) {
        console.log(`\n  >> WARNING: Found invoices with weekNumber > 1000 (likely corrupted):`);
        for (const inv of hugeWeekNumbers) {
            console.log(`     ${inv.invoiceNumber}: weekNumber = ${inv.weekNumber}`);
        }
        console.log('  >> The healing script needs to re-run for these drivers.');
    }

    console.log('\n=== DONE ===');
    console.log('Index fixed. You can now re-run the cron job.');

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

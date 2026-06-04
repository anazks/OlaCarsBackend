require('dotenv').config();
const mongoose = require('mongoose');

async function triggerGeneration() {
    // Connect to DB
    const connectDB = require('../Src/config/dbConfig');
    // Register schemas
    require('../Src/modules/Vehicle/Model/VehicleModel');
    require('../Src/modules/Branch/Model/BranchModel');
    require('../Src/modules/Admin/model/adminModel');
    
    await connectDB();
    console.log("Connected to MongoDB\n");

    const InvoiceCronService = require('../Src/modules/Invoice/Service/InvoiceCronService');
    
    console.log("Triggering invoice generation for current week...\n");
    const result = await InvoiceCronService.generateCurrentWeekInvoices(true);
    
    console.log("\n=== RESULT ===");
    console.log(`Generated: ${result.generatedCount}`);
    console.log(`Skipped: ${result.skippedCount}`);
    if (result.error) console.log(`Error: ${result.error}`);

    await mongoose.disconnect();
    console.log("\nDone.");
}

triggerGeneration().catch(e => { console.error(e); process.exit(1); });

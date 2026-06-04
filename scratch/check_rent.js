require('dotenv').config();
const mongoose = require('mongoose');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB\n");

    // Find all active drivers with vehicles
    const drivers = await Driver.find({ 
        status: 'ACTIVE', 
        isDeleted: false, 
        currentVehicle: { $ne: null } 
    });

    console.log(`Found ${drivers.length} active drivers with vehicles.\n`);

    for (const d of drivers) {
        console.log(`=== Driver: ${d.personalInfo.fullName} (${d.driverId}) ===`);
        console.log(`  rentTracking entries: ${d.rentTracking?.length || 0}`);
        
        if (d.rentTracking?.length > 0) {
            // Show first 3 entries
            const first3 = d.rentTracking.slice(0, 3);
            for (const rt of first3) {
                console.log(`  Week ${rt.weekNumber} (${rt.weekLabel}): dueDate=${rt.dueDate || 'NULL'}, amount=${rt.amount}, status=${rt.status}`);
            }
        }

        // Check invoices
        const invoices = await Invoice.find({ driver: d._id, isDeleted: false }).sort({ weekNumber: 1 });
        console.log(`  Invoices: ${invoices.length}`);
        if (invoices.length > 0) {
            for (const inv of invoices.slice(0, 3)) {
                console.log(`    Week ${inv.weekNumber}: dueDate=${inv.dueDate || 'NULL'}, status=${inv.status}, balance=${inv.balance}`);
            }
        }
        console.log();
    }

    await mongoose.disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });

require('dotenv').config({path: '../.env'});
const mongoose = require('mongoose');

// Register all schemas in mongoose
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const Admin = require('../Src/modules/Admin/model/adminModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function heal() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const rentalInvoices = await Invoice.find({ invoiceType: 'RENTAL', isDeleted: false });
        console.log(`Found ${rentalInvoices.length} total active rental invoices to analyze.`);

        // Group by driver
        const invoicesByDriver = {};
        for (const invoice of rentalInvoices) {
            if (!invoice.driver) continue;
            const dId = invoice.driver.toString();
            if (!invoicesByDriver[dId]) {
                invoicesByDriver[dId] = [];
            }
            invoicesByDriver[dId].push(invoice);
        }

        const driverIds = Object.keys(invoicesByDriver);
        console.log(`Grouped into ${driverIds.length} unique drivers.`);

        let healedCount = 0;

        for (const dId of driverIds) {
            const driver = await Driver.findById(dId);
            if (!driver) {
                console.log(`Driver not found for ID: ${dId}. Skipping.`);
                continue;
            }

            const driverInvoices = invoicesByDriver[dId];
            // Sort by dueDate ascending
            driverInvoices.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            // Sort tracking ascending
            const tracking = [...(driver.rentTracking || [])].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            console.log(`Driver ${driver.driverId} (${driver.personalInfo?.fullName}) has ${driverInvoices.length} invoices and ${tracking.length} tracking periods.`);

            for (let index = 0; index < driverInvoices.length; index++) {
                const invoice = driverInvoices[index];
                const originalWeek = invoice.weekNumber;
                let targetWeek = null;

                // Match by dueDate (within 1 day threshold)
                const invDue = new Date(invoice.dueDate);
                const matchedPeriod = tracking.find(p => {
                    const trackingDue = new Date(p.dueDate);
                    const diffTime = Math.abs(invDue - trackingDue);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 1;
                });

                if (matchedPeriod) {
                    targetWeek = matchedPeriod.weekNumber;
                } else {
                    // Fallback to chronological index + 1
                    targetWeek = index + 1;
                }

                // If the value in DB is different or not a number type, update it
                if (originalWeek !== targetWeek) {
                    invoice.weekNumber = targetWeek;
                    await invoice.save();
                    healedCount++;
                    console.log(`  -> Healed Invoice #${invoice.invoiceNumber}: weekNumber "${originalWeek}" -> ${targetWeek} (Due: ${invoice.dueDate.toISOString().split('T')[0]})`);
                }
            }
        }

        console.log(`\nHealed ${healedCount} invoices in total.`);

    } catch (e) {
        console.error("Heal failed:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

heal();

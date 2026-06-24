require('dotenv').config();
const mongoose = require('mongoose');

// Register schemas
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function findWeirdInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const drivers = await Driver.find({ isDeleted: false, status: 'ACTIVE' });
        console.log(`Analyzing invoices for ${drivers.length} active drivers...\n`);

        const affectedDrivers = [];

        for (const driver of drivers) {
            const invoices = await Invoice.find({
                driver: driver._id,
                invoiceType: 'RENTAL',
                isDeleted: false
            }).sort({ dueDate: 1 }); // Sort by due date chronologically

            if (invoices.length === 0) continue;

            let isAffected = false;
            const issueDetails = [];

            // Check if weekNumber is strictly increasing with dueDate
            for (let i = 0; i < invoices.length; i++) {
                const inv = invoices[i];
                
                // Check if weekNumber has repeated '1's (11, 111, 1111) while count of invoices is small
                // Or if it's out of sync with chronological order
                const weekNumStr = String(inv.weekNumber);
                const isRepeatedOnes = /^1{2,}$/.test(weekNumStr) && invoices.length < 50; 
                
                let isOutofOrder = false;
                if (i > 0) {
                    const prevInv = invoices[i - 1];
                    if (inv.weekNumber <= prevInv.weekNumber) {
                        isOutofOrder = true;
                    }
                }

                if (isRepeatedOnes || isOutofOrder) {
                    isAffected = true;
                    issueDetails.push({
                        invoiceNumber: inv.invoiceNumber,
                        weekNumber: inv.weekNumber,
                        weekLabel: inv.weekLabel,
                        dueDate: inv.dueDate.toISOString().split('T')[0],
                        issue: isRepeatedOnes ? "Repeated 1s" : "Out of order"
                    });
                }
            }

            if (isAffected) {
                affectedDrivers.push({
                    driverId: driver.driverId,
                    fullName: driver.personalInfo?.fullName,
                    invoicesCount: invoices.length,
                    rentTrackingCount: driver.rentTracking?.length || 0,
                    issues: issueDetails,
                    allInvoices: invoices.map(inv => ({
                        invoiceNumber: inv.invoiceNumber,
                        weekNumber: inv.weekNumber,
                        weekLabel: inv.weekLabel,
                        dueDate: inv.dueDate.toISOString().split('T')[0]
                    }))
                });
            }
        }

        console.log(`Found ${affectedDrivers.length} affected drivers.`);
        affectedDrivers.forEach(d => {
            console.log(`Driver: ${d.fullName} (${d.driverId})`);
            console.log(`  Issues count: ${d.issues.length}`);
            d.issues.forEach(iss => {
                console.log(`    - Inv: ${iss.invoiceNumber} | Week: ${iss.weekNumber} | Label: "${iss.weekLabel}" | Due: ${iss.dueDate} | Issue: ${iss.issue}`);
            });
            console.log("  Full Invoices List chronologically by due date:");
            d.allInvoices.forEach(inv => {
                console.log(`    [${inv.invoiceNumber}] Week: ${inv.weekNumber} | Label: "${inv.weekLabel}" | Due: ${inv.dueDate}`);
            });
            console.log("==================================================\n");
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

findWeirdInvoices();

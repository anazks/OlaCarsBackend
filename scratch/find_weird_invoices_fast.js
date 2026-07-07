require('dotenv').config();
const mongoose = require('mongoose');

// Register schemas
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function findWeirdInvoicesFast() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        console.log("Fetching drivers...");
        const drivers = await Driver.find({ isDeleted: false, status: 'ACTIVE' })
            .select('_id driverId personalInfo.fullName rentTracking')
            .lean();
        
        const driverMap = new Map();
        drivers.forEach(d => {
            driverMap.set(d._id.toString(), d);
        });

        console.log(`Fetched ${drivers.length} drivers. Fetching rental invoices...`);
        const invoices = await Invoice.find({
            invoiceType: 'RENTAL',
            isDeleted: false
        })
        .select('driver invoiceNumber weekNumber weekLabel dueDate createdAt')
        .lean();

        console.log(`Fetched ${invoices.length} invoices. Grouping in memory...`);
        const invoicesByDriver = new Map();
        invoices.forEach(inv => {
            if (!inv.driver) return;
            const driverIdStr = inv.driver.toString();
            if (!invoicesByDriver.has(driverIdStr)) {
                invoicesByDriver.set(driverIdStr, []);
            }
            invoicesByDriver.get(driverIdStr).push(inv);
        });

        const affectedDrivers = [];

        for (const [driverIdStr, driverInvoices] of invoicesByDriver.entries()) {
            const driver = driverMap.get(driverIdStr);
            if (!driver) continue; // Driver might be inactive/deleted now

            // Sort invoices by due date chronologically
            driverInvoices.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            let isAffected = false;
            const issueDetails = [];

            for (let i = 0; i < driverInvoices.length; i++) {
                const inv = driverInvoices[i];
                const weekNumStr = String(inv.weekNumber);
                const isRepeatedOnes = /^1{2,}$/.test(weekNumStr) && driverInvoices.length < 50;
                
                let isOutofOrder = false;
                if (i > 0) {
                    const prevInv = driverInvoices[i - 1];
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
                        dueDate: new Date(inv.dueDate).toISOString().split('T')[0],
                        issue: isRepeatedOnes ? "Repeated 1s" : "Out of order"
                    });
                }
            }

            if (isAffected) {
                affectedDrivers.push({
                    driverId: driver.driverId,
                    fullName: driver.personalInfo?.fullName,
                    invoicesCount: driverInvoices.length,
                    rentTrackingCount: driver.rentTracking?.length || 0,
                    issues: issueDetails,
                    allInvoices: driverInvoices.map(inv => ({
                        invoiceNumber: inv.invoiceNumber,
                        weekNumber: inv.weekNumber,
                        weekLabel: inv.weekLabel,
                        dueDate: new Date(inv.dueDate).toISOString().split('T')[0]
                    }))
                });
            }
        }

        console.log(`\nFound ${affectedDrivers.length} affected drivers out of ${invoicesByDriver.size} drivers with invoices.`);
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

findWeirdInvoicesFast();

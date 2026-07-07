require('dotenv').config();
const mongoose = require('mongoose');

// Register schemas
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function findDriver() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        console.log("Fetching all active drivers...");
        const drivers = await Driver.find({ isDeleted: false, status: 'ACTIVE' }).lean();
        const driverMap = new Map(drivers.map(d => [d._id.toString(), d]));

        console.log("Fetching all raw rental invoices...");
        const invoices = await mongoose.connection.db.collection('invoices').find({
            invoiceType: 'RENTAL',
            isDeleted: false
        }).toArray();

        console.log(`Found ${invoices.length} invoices. Grouping in memory...`);
        const invoicesByDriver = new Map();
        for (const inv of invoices) {
            if (!inv.driver) continue;
            const dId = inv.driver.toString();
            if (!invoicesByDriver.has(dId)) {
                invoicesByDriver.set(dId, []);
            }
            invoicesByDriver.get(dId).push(inv);
        }

        console.log(`Scanning drivers for match...`);
        for (const [dId, driverInvoices] of invoicesByDriver.entries()) {
            const driver = driverMap.get(dId);
            if (!driver) continue;

            driverInvoices.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            // Check if there's any invoice with weekNumber "11" or "111" or 11 or 111
            const has11 = driverInvoices.some(inv => String(inv.weekNumber) === "11");
            const has111 = driverInvoices.some(inv => String(inv.weekNumber) === "111");

            if (has11 && has111) {
                // Find those specific invoices
                const week11 = driverInvoices.find(inv => String(inv.weekNumber) === "11");
                const week111 = driverInvoices.find(inv => String(inv.weekNumber) === "111");

                const date11 = new Date(week11.dueDate).toISOString().split('T')[0];
                const date111 = new Date(week111.dueDate).toISOString().split('T')[0];

                // Let's filter or print if they match the user's report (e.g. week 11 - Jul 29, week 111 - Jun 28, or general pattern)
                console.log(`\nMATCH FOUND!`);
                console.log(`Driver: ${driver.personalInfo?.fullName} (${driver.driverId})`);
                console.log(`  Week 11 Due Date: ${date11}`);
                console.log(`  Week 111 Due Date: ${date111}`);
                console.log(`  All invoices:`);
                driverInvoices.forEach(inv => {
                    console.log(`    - Inv: ${inv.invoiceNumber} | Week: ${inv.weekNumber} (type: ${typeof inv.weekNumber}) | Label: "${inv.weekLabel}" | Due: ${new Date(inv.dueDate).toISOString().split('T')[0]}`);
                });
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

findDriver();

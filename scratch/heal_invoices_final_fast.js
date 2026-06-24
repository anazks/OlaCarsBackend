require('dotenv').config();
const mongoose = require('mongoose');

// Register schemas
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function heal() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        console.log("Fetching all active/inactive drivers...");
        const driversList = await Driver.find({ isDeleted: false }).lean();
        const driversById = new Map(driversList.map(d => [d._id.toString(), d]));
        console.log(`Fetched ${driversList.length} drivers.`);

        console.log("Fetching all active/inactive customers...");
        const customersList = await Customer.find({ isDeleted: false }).lean();
        const customerMap = new Map(customersList.map(c => [c._id.toString(), c]));
        console.log(`Fetched ${customersList.length} customers.`);

        // Build customerId -> driver mapping
        const customerToDriver = new Map();
        for (const c of customersList) {
            if (c.driver) {
                const driver = driversById.get(c.driver.toString());
                if (driver) {
                    customerToDriver.set(c._id.toString(), driver);
                }
            }
        }

        console.log("Fetching all active rental invoices...");
        const invoices = await Invoice.find({
            invoiceType: 'RENTAL',
            isDeleted: false
        }).lean();
        console.log(`Fetched ${invoices.length} invoices.`);

        // Group invoices by customer in memory
        console.log("Grouping invoices by customer...");
        const invoicesByCustomer = new Map();
        for (const inv of invoices) {
            if (!inv.customer) continue;
            const cIdStr = inv.customer.toString();
            if (!invoicesByCustomer.has(cIdStr)) {
                invoicesByCustomer.set(cIdStr, []);
            }
            invoicesByCustomer.get(cIdStr).push(inv);
        }

        console.log(`Analyzing invoices for ${invoicesByCustomer.size} customer groups...`);
        let bulkOps = [];

        for (const [customerIdStr, customerInvoices] of invoicesByCustomer.entries()) {
            const driver = customerToDriver.get(customerIdStr);
            const customer = customerMap.get(customerIdStr);

            // Sort invoices by dueDate ascending
            customerInvoices.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            const tracking = driver ? [...(driver.rentTracking || [])].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)) : [];

            for (let i = 0; i < customerInvoices.length; i++) {
                const invoice = customerInvoices[i];
                const originalWeek = invoice.weekNumber;
                const originalType = typeof invoice.weekNumber;
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
                    targetWeek = Number(matchedPeriod.weekNumber);
                } else {
                    // Fallback to chronological index + 1
                    targetWeek = i + 1;
                }

                // Parse label update if needed
                let originalLabel = invoice.weekLabel || "";
                let targetLabel = originalLabel;
                if (originalLabel.match(/^Week\s+\d+/i)) {
                    targetLabel = originalLabel.replace(/^Week\s+\d+/i, `Week ${targetWeek}`);
                }

                const needsWeekUpdate = Number(originalWeek) !== targetWeek;
                const needsTypeUpdate = originalType !== 'number';
                const needsLabelUpdate = originalLabel !== targetLabel;

                // Also make sure driver field is correctly populated on the invoice if we have it
                const needsDriverPopulate = driver && (!invoice.driver || invoice.driver.toString() !== driver._id.toString());

                if (needsWeekUpdate || needsTypeUpdate || needsLabelUpdate || needsDriverPopulate) {
                    const setFields = {
                        weekNumber: targetWeek,
                        weekLabel: targetLabel
                    };
                    if (needsDriverPopulate) {
                        setFields.driver = driver._id;
                        if (driver.currentVehicle && !invoice.vehicle) {
                            setFields.vehicle = driver.currentVehicle._id || driver.currentVehicle;
                        }
                    }

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: invoice._id },
                            update: { $set: setFields }
                        }
                    });
                }
            }
        }

        console.log(`Found ${bulkOps.length} updates to make.`);
        if (bulkOps.length > 0) {
            console.log("Executing bulk writes in batches of 1000...");
            const batchSize = 1000;
            for (let i = 0; i < bulkOps.length; i += batchSize) {
                const batch = bulkOps.slice(i, i + batchSize);
                await mongoose.connection.db.collection('invoices').bulkWrite(batch);
                console.log(`  Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(bulkOps.length / batchSize)}`);
            }
            console.log("All bulk writes completed successfully!");
        } else {
            console.log("No healing needed.");
        }

    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

heal();

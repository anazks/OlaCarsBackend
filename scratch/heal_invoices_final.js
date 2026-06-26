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

        console.log("Fetching active drivers...");
        const drivers = await Driver.find({ isDeleted: false, status: 'ACTIVE' })
            .select('_id driverId personalInfo.fullName rentTracking')
            .lean();
        const driverMap = new Map(drivers.map(d => [d._id.toString(), d]));
        console.log(`Fetched ${drivers.length} drivers.`);

        console.log("Fetching all active rental invoices...");
        const invoices = await Invoice.find({
            invoiceType: 'RENTAL',
            isDeleted: false
        }).lean();
        console.log(`Fetched ${invoices.length} invoices.`);

        // Group invoices by driver in memory
        console.log("Grouping invoices by driver...");
        const invoicesByDriver = new Map();
        for (const inv of invoices) {
            if (!inv.driver) continue;
            const dIdStr = inv.driver.toString();
            if (!invoicesByDriver.has(dIdStr)) {
                invoicesByDriver.set(dIdStr, []);
            }
            invoicesByDriver.get(dIdStr).push(inv);
        }

        console.log(`Analyzing invoices for ${invoicesByDriver.size} drivers...`);
        let totalHealed = 0;
        let processedDrivers = 0;

        for (const [driverIdStr, driverInvoices] of invoicesByDriver.entries()) {
            const driver = driverMap.get(driverIdStr);
            if (!driver) continue; // Driver might be inactive/deleted now

            // Sort invoices by dueDate ascending
            driverInvoices.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            const tracking = [...(driver.rentTracking || [])].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

            const updates = [];

            for (let i = 0; i < driverInvoices.length; i++) {
                const invoice = driverInvoices[i];
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
                    // Replace the old week number in the label with targetWeek
                    targetLabel = originalLabel.replace(/^Week\s+\d+/i, `Week ${targetWeek}`);
                }

                // Check if any update is required:
                // 1. weekNumber value is different
                // 2. weekNumber type in MongoDB is string
                // 3. weekLabel needs to be updated
                const needsWeekUpdate = Number(originalWeek) !== targetWeek;
                const needsTypeUpdate = originalType !== 'number';
                const needsLabelUpdate = originalLabel !== targetLabel;

                if (needsWeekUpdate || needsTypeUpdate || needsLabelUpdate) {
                    updates.push({
                        invoice,
                        targetWeek,
                        targetLabel,
                        originalWeek,
                        originalType,
                        originalLabel
                    });
                }
            }

            if (updates.length > 0) {
                console.log(`Driver: ${driver.personalInfo?.fullName} (${driver.driverId}) - healing ${updates.length} invoices...`);
                for (const update of updates) {
                    const { invoice, targetWeek, targetLabel, originalWeek, originalType, originalLabel } = update;
                    
                    // Update in database using raw MongoDB collection update to ensure type casting
                    await mongoose.connection.db.collection('invoices').updateOne(
                        { _id: invoice._id },
                        { 
                            $set: { 
                                weekNumber: targetWeek,
                                weekLabel: targetLabel
                            } 
                        }
                    );

                    console.log(`  - Invoice ${invoice.invoiceNumber}: weekNumber ${originalWeek} (${originalType}) -> ${targetWeek} (number) | label: "${originalLabel}" -> "${targetLabel}"`);
                    totalHealed++;
                }
            }
            processedDrivers++;
        }

        console.log(`\nMigration completed. Processed ${processedDrivers} drivers. Total healed invoices: ${totalHealed}`);

    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

heal();

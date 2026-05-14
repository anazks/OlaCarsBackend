const cron = require('node-cron');
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../Model/InvoiceModel");

const startInvoiceCronJob = () => {
    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[InvoiceCronService] Running daily invoice generation check...');
        try {
            await exports.generateDueInvoices();
        } catch (error) {
            console.error('[InvoiceCronService] Error generating invoices:', error);
        }
    });
};

exports.generateDueInvoices = async () => {
    // 1. Find all active drivers who have a vehicle and a rent plan
    const activeDrivers = await Driver.find({
        status: 'ACTIVE',
        isDeleted: false,
        currentVehicle: { $ne: null },
        rentTracking: { $exists: true, $not: { $size: 0 } }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const driver of activeDrivers) {
        try {
            // Sort rent tracking to find next due
            const tracking = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);
            
            // Find the latest invoice we generated for this driver
            const lastInvoice = await Invoice.findOne({ driver: driver._id, isDeleted: false })
                .sort({ weekNumber: -1 });

            let nextPeriodIndex = 0;
            if (lastInvoice) {
                nextPeriodIndex = tracking.findIndex(t => t.weekNumber === lastInvoice.weekNumber) + 1;
            }

            if (nextPeriodIndex >= tracking.length) {
                // Contract is over, no more invoices to generate
                continue;
            }

            const nextPeriod = tracking[nextPeriodIndex];
            const dueDate = new Date(nextPeriod.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            
            // If the due date for the next period is today or in the past, we need to generate it
            // (e.g. if we want to generate it exactly on the due date)
            if (dueDate <= today) {
                // Calculate carryover from the previous invoice (lastInvoice)
                let carryOver = 0;
                if (lastInvoice && lastInvoice.status !== 'PAID') {
                    carryOver = lastInvoice.balance;
                }

                const amount = nextPeriod.amount;
                const newTotalDue = amount + carryOver;

                const ts = Date.now();
                const newInvoice = new Invoice({
                    invoiceNumber: `INV-${ts}-${nextPeriod.weekNumber}`,
                    driver: driver._id,
                    vehicle: driver.currentVehicle,
                    weekNumber: nextPeriod.weekNumber,
                    weekLabel: nextPeriod.weekLabel,
                    dueDate: nextPeriod.dueDate,
                    baseAmount: amount,
                    carryOverAmount: carryOver,
                    totalAmountDue: newTotalDue,
                    amountPaid: 0,
                    balance: newTotalDue,
                    status: "PENDING",
                    payments: [],
                    createdBy: "SYSTEM",
                    creatorRole: "SYSTEM"
                });

                await newInvoice.save();
                console.log(`[InvoiceCronService] Generated invoice for Driver ${driver._id}, Week/Month ${nextPeriod.weekNumber}`);
            }
        } catch (err) {
            console.error(`[InvoiceCronService] Error processing driver ${driver._id}:`, err);
        }
    }
};

exports.startInvoiceCronJob = startInvoiceCronJob;

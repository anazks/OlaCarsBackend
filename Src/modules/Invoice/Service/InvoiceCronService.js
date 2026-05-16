const cron = require('node-cron');
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../Model/InvoiceModel");
const { createAlertRepo, findActiveAlertRepo } = require("../../Alert/Repo/AlertRepo");

const startInvoiceCronJob = () => {
    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[InvoiceCronService] Running daily invoice generation and overdue check...');
        try {
            await exports.generateDueInvoices();
            await exports.checkOverdueInvoices();
        } catch (error) {
            console.error('[InvoiceCronService] Error generating/checking invoices:', error);
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

exports.checkOverdueInvoices = async () => {
    console.log('[InvoiceCronService] Checking for overdue invoices...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const overdueInvoices = await Invoice.find({
            status: { $in: ["PENDING", "PARTIAL"] },
            dueDate: { $lt: today },
            isDeleted: false
        }).populate("driver").populate({
            path: "vehicle",
            populate: { path: "purchaseDetails.branch" }
        });

        for (const invoice of overdueInvoices) {
            // Update status to OVERDUE
            invoice.status = "OVERDUE";
            await invoice.save();
            console.log(`[InvoiceCronService] Marked Invoice ${invoice.invoiceNumber} as OVERDUE.`);

            // Create an alert if not exists
            if (invoice.vehicle) {
                // To avoid duplicate alerts for the same invoice, we check metadata.invoiceId
                // findActiveAlertRepo checks by vehicle and type, but if there are multiple overdue invoices for the same vehicle,
                // we might want multiple alerts. Let's just create one if we can't find an existing one for THIS invoice.
                // Actually we should just query Alert directly for THIS invoice, or use vehicle + type and hope the user resolves it.
                // Using findActiveAlertRepo will create 1 alert per vehicle.
                const existing = await findActiveAlertRepo(invoice.vehicle._id, "INVOICE");
                
                if (!existing) {
                    await createAlertRepo({
                        type: "INVOICE",
                        vehicleId: invoice.vehicle._id,
                        branchId: invoice.vehicle.purchaseDetails?.branch?._id || invoice.vehicle.purchaseDetails?.branch,
                        country: invoice.vehicle.purchaseDetails?.branch?.country || "UNKNOWN",
                        priority: "MEDIUM", // Major Alert
                        message: `Invoice ${invoice.invoiceNumber} for driver ${invoice.driver?.firstName || ''} ${invoice.driver?.lastName || ''} is overdue. Amount due: $${invoice.balance}`,
                        metadata: {
                            invoiceId: invoice._id,
                            invoiceNumber: invoice.invoiceNumber,
                            driverId: invoice.driver?._id,
                            balance: invoice.balance
                        }
                    });
                    console.log(`[InvoiceCronService] Created Major Alert for overdue invoice ${invoice.invoiceNumber}.`);
                }
            }
        }
    } catch (error) {
        console.error('[InvoiceCronService] Error checking overdue invoices:', error);
    }
};

exports.startInvoiceCronJob = startInvoiceCronJob;

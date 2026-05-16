const cron = require('node-cron');
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../Model/InvoiceModel");
const SystemSettings = require("../../SystemSettings/Model/SystemSettingsModel");

const startInvoiceCronJob = () => {
    // Run daily at 01:00 AM to check if today is the generation day
    cron.schedule('0 1 * * *', async () => {
        console.log('[InvoiceCronService] Checking daily scheduled task...');
        try {
            const today = new Date();
            const currentDay = today.getDay(); // 0 (Sun) - 6 (Sat)
            
            // Get configured generation day (default 3 = Wednesday)
            const setting = await SystemSettings.findOne({ key: 'invoice_generation_day' });
            const generationDay = setting ? parseInt(setting.value) : 3;

            if (currentDay === generationDay) {
                console.log(`[InvoiceCronService] Today is the configured generation day (${generationDay}). Starting bulk generation...`);
                await exports.generateCurrentWeekInvoices();
            }
        } catch (error) {
            console.error('[InvoiceCronService] Error in cron job:', error);
        }
    });
};

exports.generateCurrentWeekInvoices = async (manual = false) => {
    console.log(`[InvoiceCronService] ${manual ? 'Manual' : 'Scheduled'} generation started...`);
    
    // 1. Find all active drivers who have a vehicle
    const activeDrivers = await Driver.find({
        status: 'ACTIVE',
        isDeleted: false,
        currentVehicle: { $ne: null }
    }).populate('currentVehicle');

    console.log(`[InvoiceCronService] Found ${activeDrivers.length} active drivers with vehicles.`);

    let generatedCount = 0;
    let skippedCount = 0;

    for (const driver of activeDrivers) {
        try {
            if (!driver.rentTracking || driver.rentTracking.length === 0) {
                console.log(`[InvoiceCronService] Driver ${driver.driverId} has no rentTracking. Skipping.`);
                skippedCount++;
                continue;
            }

            // Find the most recent invoice to get the next week number
            const lastInvoice = await Invoice.findOne({ driver: driver._id, isDeleted: false })
                .sort({ weekNumber: -1 });

            const tracking = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);
            
            let nextPeriod;
            if (!lastInvoice) {
                // If no invoices exist, start with the first period in tracking
                nextPeriod = tracking[0];
            } else {
                // Find the period after the last generated invoice
                const lastIdx = tracking.findIndex(t => t.weekNumber === lastInvoice.weekNumber);
                if (lastIdx === -1) {
                    // If last invoice weekNumber not in tracking, try to find the first tracking item with weekNumber > lastInvoice.weekNumber
                    nextPeriod = tracking.find(t => t.weekNumber > lastInvoice.weekNumber);
                } else {
                    nextPeriod = tracking[lastIdx + 1];
                }
            }

            if (!nextPeriod) {
                console.log(`[InvoiceCronService] No next period found for Driver ${driver.driverId}. Last Week: ${lastInvoice?.weekNumber || 'None'}`);
                skippedCount++;
                continue;
            }

            // CHECK: Is it "this week"? 
            // Only generate if dueDate is in the past OR within the next 7 days
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueLimit = new Date(today);
            dueLimit.setDate(today.getDate() + 7);

            const dueDate = new Date(nextPeriod.dueDate);
            
            // Limit generation to "this week" (within next 7 days)
            // This ensures we catch both past-due invoices and the upcoming one for the current week.
            if (dueDate > dueLimit) {
                console.log(`[InvoiceCronService] Next period (Week ${nextPeriod.weekNumber}) for Driver ${driver.driverId} is too far in future (Due: ${dueDate.toLocaleDateString()}). Skipping.`);
                skippedCount++;
                continue;
            }

            // Ensure we don't generate the same week twice (extra safety)
            const existing = await Invoice.findOne({ 
                driver: driver._id, 
                weekNumber: nextPeriod.weekNumber, 
                isDeleted: false 
            });
            
            if (existing) {
                console.log(`[InvoiceCronService] Invoice for Week ${nextPeriod.weekNumber} already exists for Driver ${driver.driverId}. Skipping.`);
                skippedCount++;
                continue;
            }

            // Generate it!
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
                vehicle: driver.currentVehicle._id || driver.currentVehicle,
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
            generatedCount++;
        } catch (err) {
            console.error(`[InvoiceCronService] Error processing driver ${driver.driverId}:`, err);
        }
    }

    console.log(`[InvoiceCronService] Generation finished. Created: ${generatedCount}, Skipped: ${skippedCount}`);
    return { generatedCount, skippedCount };
};

exports.generateDueInvoices = async () => {
    // Keep this for backward compatibility if needed, but it's redundant now
    return await exports.generateCurrentWeekInvoices();
};

exports.startInvoiceCronJob = startInvoiceCronJob;

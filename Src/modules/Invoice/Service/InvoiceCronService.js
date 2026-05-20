const cron = require('node-cron');
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../Model/InvoiceModel");
const { createAlertRepo, findActiveAlertRepo } = require("../../Alert/Repo/AlertRepo");
const {
    sendInvoiceCreatedEmail,
    sendInvoiceReminderEmail,
    sendInvoiceDueTodayEmail,
    sendVehicleRecoveryEmail
} = require("../../../utils/emailService");

const startInvoiceCronJob = () => {
    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[InvoiceCronService] Running daily invoice generation, reminders, and overdue check...');
        try {
            await exports.generateDueInvoices();
            await exports.checkAndSendRentReminders();
            await exports.checkOverdueInvoices();
        } catch (error) {
            console.error('[InvoiceCronService] Error in daily invoice cron routines:', error);
        }
    });
};

exports.generateCurrentWeekInvoices = async (manual = false, userId = null, userRole = null) => {
    console.log(`[InvoiceCronService] ${manual ? 'Manual' : 'Scheduled'} generation started by ${userRole || 'SYSTEM'}...`);
    
    // 1. Resolve Creator Details (Schema requires valid ObjectId and Enum)
    let finalUserId = userId;
    let finalUserRole = userRole;

    if (!finalUserId) {
        // Find first active ADMIN for system-generated invoices
        const Admin = require("../../Admin/model/adminModel");
        const systemAdmin = await Admin.findOne({ role: 'ADMIN', isDeleted: false });
        if (systemAdmin) {
            finalUserId = systemAdmin._id;
            finalUserRole = 'ADMIN';
        } else {
            console.error("[InvoiceCronService] Critical: No ADMIN found to attribute system invoices to.");
            return { generatedCount: 0, skippedCount: 0, error: 'NO_ADMIN_FOUND' };
        }
    }

    // 2. Find all active drivers who have a vehicle
    const activeDrivers = await Driver.find({
        status: 'ACTIVE',
        isDeleted: false,
        currentVehicle: { $ne: null }
    }).populate('currentVehicle').populate({
        path: 'branch',
        populate: { path: 'branchManager' }
    });

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
            dueDate.setHours(0, 0, 0, 0);
            
            // Limit generation to "this week" (within next 7 days)
            if (dueDate > dueLimit) {
                console.log(`[InvoiceCronService] SKIPPING ${driver.driverId}: Next period (Week ${nextPeriod.weekNumber}) is too far in future. Due: ${dueDate.toISOString().split('T')[0]}, Limit: ${dueLimit.toISOString().split('T')[0]}`);
                skippedCount++;
                continue;
            }

            console.log(`[InvoiceCronService] PROCESSING ${driver.driverId}: Generating Week ${nextPeriod.weekNumber} (Due: ${dueDate.toISOString().split('T')[0]})`);

            // Ensure we don't generate the same week twice (extra safety)
            const existing = await Invoice.findOne({ 
                driver: driver._id, 
                weekNumber: nextPeriod.weekNumber, 
                isDeleted: false 
            });
            
            if (existing) {
                console.log(`[InvoiceCronService] SKIPPING ${driver.driverId}: Invoice for Week ${nextPeriod.weekNumber} already exists.`);
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
                createdBy: finalUserId,
                creatorRole: finalUserRole
            });

            await newInvoice.save();
            try {
                const LedgerService = require("../../Ledger/Service/LedgerService");
                await LedgerService.generateInvoiceLedgerEntries(newInvoice);
            } catch (ledgerErr) {
                console.error("[InvoiceCronService] Failed to generate ledger entries for invoice:", ledgerErr);
            }
            console.log(`[InvoiceCronService] SUCCESS: Created invoice ${newInvoice.invoiceNumber} for ${driver.driverId}`);

            // Immediate Created Email Notification for RENTAL invoices (duplicate-safe)
            if (driver.personalInfo?.email && !newInvoice.mailSentCreated) {
                const sent = await sendInvoiceCreatedEmail(
                    driver.personalInfo.email,
                    newInvoice,
                    driver.personalInfo.fullName || "Driver",
                    driver.branch?.address || "",
                    driver.branch?.branchManager?.fullName || ""
                );
                if (sent) {
                    newInvoice.mailSentCreated = true;
                    await newInvoice.save();
                }
            }

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

exports.checkOverdueInvoices = async () => {
    console.log('[InvoiceCronService] Checking for overdue invoices...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const overdueInvoices = await Invoice.find({
            status: { $in: ["PENDING", "PARTIAL"] },
            dueDate: { $lt: today },
            isDeleted: false
        }).populate({
            path: "driver",
            populate: {
                path: "branch",
                populate: { path: "branchManager" }
            }
        }).populate({
            path: "vehicle",
            populate: { path: "purchaseDetails.branch" }
        });

        for (const invoice of overdueInvoices) {
            // Update status to OVERDUE
            invoice.status = "OVERDUE";
            await invoice.save();
            console.log(`[InvoiceCronService] Marked Invoice ${invoice.invoiceNumber} as OVERDUE.`);

            // Send Vehicle Recovery Email for overdue RENTAL invoices
            if (invoice.invoiceType === 'RENTAL' && invoice.driver?.personalInfo?.email && !invoice.mailSentRecovery) {
                const sent = await sendVehicleRecoveryEmail(
                    invoice.driver.personalInfo.email,
                    invoice,
                    invoice.driver.personalInfo.fullName || "Driver",
                    invoice.driver.branch?.address || "",
                    invoice.driver.branch?.branchManager?.fullName || ""
                );
                if (sent) {
                    invoice.mailSentRecovery = true;
                    await invoice.save();
                }
            }

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

exports.checkAndSendRentReminders = async () => {
    console.log('[InvoiceCronService] Checking and sending rent reminders (3 days before & due today)...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. FRIENDLY REMINDER: 3 DAYS BEFORE DUE DATE
    const threeDaysFromNowStart = new Date(today);
    threeDaysFromNowStart.setDate(today.getDate() + 3);
    const threeDaysFromNowEnd = new Date(today);
    threeDaysFromNowEnd.setDate(today.getDate() + 4);

    try {
        const invoices3d = await Invoice.find({
            invoiceType: 'RENTAL',
            status: { $in: ["PENDING", "PARTIAL"] },
            dueDate: { $gte: threeDaysFromNowStart, $lt: threeDaysFromNowEnd },
            mailSentReminder3d: false,
            isDeleted: false
        }).populate({
            path: "driver",
            populate: {
                path: "branch",
                populate: { path: "branchManager" }
            }
        });

        console.log(`[InvoiceCronService] Found ${invoices3d.length} invoices due in 3 days.`);
        for (const invoice of invoices3d) {
            if (invoice.driver?.personalInfo?.email) {
                const sent = await sendInvoiceReminderEmail(
                    invoice.driver.personalInfo.email,
                    invoice,
                    invoice.driver.personalInfo.fullName || "Driver",
                    invoice.driver.branch?.address || "",
                    invoice.driver.branch?.branchManager?.fullName || ""
                );
                if (sent) {
                    invoice.mailSentReminder3d = true;
                    await invoice.save();
                }
            }
        }
    } catch (error) {
        console.error('[InvoiceCronService] Error in 3-day reminder:', error);
    }

    // 2. DUE TODAY REMINDER
    const todayEnd = new Date(today);
    todayEnd.setDate(today.getDate() + 1);

    try {
        const invoicesToday = await Invoice.find({
            invoiceType: 'RENTAL',
            status: { $in: ["PENDING", "PARTIAL"] },
            dueDate: { $gte: today, $lt: todayEnd },
            mailSentDueToday: false,
            isDeleted: false
        }).populate({
            path: "driver",
            populate: {
                path: "branch",
                populate: { path: "branchManager" }
            }
        });

        console.log(`[InvoiceCronService] Found ${invoicesToday.length} invoices due today.`);
        for (const invoice of invoicesToday) {
            if (invoice.driver?.personalInfo?.email) {
                const sent = await sendInvoiceDueTodayEmail(
                    invoice.driver.personalInfo.email,
                    invoice,
                    invoice.driver.personalInfo.fullName || "Driver",
                    invoice.driver.branch?.address || "",
                    invoice.driver.branch?.branchManager?.fullName || ""
                );
                if (sent) {
                    invoice.mailSentDueToday = true;
                    await invoice.save();
                }
            }
        }
    } catch (error) {
        console.error('[InvoiceCronService] Error in due today reminder:', error);
    }
};

exports.startInvoiceCronJob = startInvoiceCronJob;

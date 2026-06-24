const cron = require('node-cron');
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../Model/InvoiceModel");
const { createAlertRepo, findActiveAlertRepo } = require("../../Alert/Repo/AlertRepo");
const InvoiceService = require("./InvoiceService");
const Tax = require("../../Tax/Model/TaxModel");
const {
    sendInvoiceCreatedEmail,
    sendInvoiceReminderEmail,
    sendInvoiceDueTodayEmail,
    sendVehicleRecoveryEmail
} = require("../../../utils/emailService");

const startInvoiceCronJob = () => {
    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[InvoiceCronService] Running daily invoice routines...');
        try {
            const today = new Date();
            const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday, etc.

            const SystemSettings = require("../../SystemSettings/Model/SystemSettingsModel");
            const setting = await SystemSettings.findOne({ key: 'invoice_generation_day' });
            const generationDay = setting ? parseInt(setting.value) : 3; // Default 3 (Wednesday)

            if (currentDay === generationDay) {
                console.log(`[InvoiceCronService] Today (day ${currentDay}) matches the configured generation day (${generationDay}). Running weekly generation...`);
                await exports.generateDueInvoices();
            } else {
                console.log(`[InvoiceCronService] Today is day ${currentDay}, but configured generation day is ${generationDay}. Skipping weekly generation.`);
            }

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

    // 2. Find all active customers who are linked to a driver
    const Customer = require("../../Customer/Model/CustomerModel");
    const activeCustomers = await Customer.find({
        status: 'ACTIVE',
        isDeleted: false,
        driver: { $ne: null }
    }).populate({
        path: 'driver',
        populate: [
            { path: 'currentVehicle' },
            { path: 'branch', populate: { path: 'branchManager' } }
        ]
    });

    const activeTax = await Tax.findOne({ isActive: true, isDeleted: false });
    const taxRate = activeTax ? activeTax.rate : 0;

    console.log(`[InvoiceCronService] Found ${activeCustomers.length} active customers with drivers.`);

    let generatedCount = 0;
    let skippedCount = 0;

    for (const customer of activeCustomers) {
        const driver = customer.driver;
        if (!driver || driver.status !== 'ACTIVE' || !driver.currentVehicle || driver.isDeleted) {
            skippedCount++;
            continue;
        }

        try {
            if (!driver.rentTracking || driver.rentTracking.length === 0) {
                console.log(`[InvoiceCronService] Driver ${driver.driverId} has no rentTracking. Skipping.`);
                skippedCount++;
                continue;
            }

            // Find the most recent RENTAL invoice to get the next week number
            // Sort by dueDate (not weekNumber) to avoid string-sorting corruption bugs
            let lastInvoice = await Invoice.findOne({ 
                driver: driver._id, 
                invoiceType: 'RENTAL',
                isDeleted: false 
            }).sort({ dueDate: -1, _id: -1 });

            const tracking = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueLimit = new Date(today);
            dueLimit.setDate(today.getDate() + 7);

            // Loop to catch up on ALL past-due and current-week invoices
            let driverGenerated = 0;
            while (true) {
                let nextPeriod;
                if (!lastInvoice) {
                    // If no invoices exist, start with the first period in tracking
                    nextPeriod = tracking[0];
                } else {
                    const lastWeekNum = Number(lastInvoice.weekNumber);
                    // Find the period after the last generated invoice
                    const lastIdx = tracking.findIndex(t => Number(t.weekNumber) === lastWeekNum);
                    if (lastIdx === -1) {
                        nextPeriod = tracking.find(t => Number(t.weekNumber) > lastWeekNum);
                    } else {
                        nextPeriod = tracking[lastIdx + 1];
                    }
                }

                if (!nextPeriod) {
                    if (driverGenerated === 0) {
                        console.log(`[InvoiceCronService] No next period found for Driver ${driver.driverId}. Last Week: ${lastInvoice?.weekNumber || 'None'}`);
                        skippedCount++;
                    }
                    break;
                }

                const dueDate = new Date(nextPeriod.dueDate);
                dueDate.setHours(0, 0, 0, 0);

                // Stop if next period is too far in the future
                if (dueDate > dueLimit) {
                    if (driverGenerated === 0) {
                        console.log(`[InvoiceCronService] SKIPPING ${driver.driverId}: Next period (Week ${nextPeriod.weekNumber}) is too far in future. Due: ${dueDate.toISOString().split('T')[0]}, Limit: ${dueLimit.toISOString().split('T')[0]}`);
                        skippedCount++;
                    }
                    break;
                }

                // Ensure we don't generate the same week twice (extra safety)
                const existing = await Invoice.findOne({ 
                    driver: driver._id, 
                    invoiceType: 'RENTAL',
                    weekNumber: nextPeriod.weekNumber, 
                    isDeleted: false 
                });
                
                if (existing) {
                    console.log(`[InvoiceCronService] SKIPPING ${driver.driverId}: Invoice for Week ${nextPeriod.weekNumber} already exists.`);
                    // Move past this week by treating the existing invoice as the last one
                    lastInvoice = existing;
                    continue;
                }

                console.log(`[InvoiceCronService] PROCESSING ${driver.driverId}: Generating Week ${nextPeriod.weekNumber} (Due: ${dueDate.toISOString().split('T')[0]})`);

                // Generate it!
                let carryOver = 0;
                if (lastInvoice && lastInvoice.status !== 'PAID') {
                    carryOver = lastInvoice.balance;
                }

                const amount = nextPeriod.amount;
                const baseAmount = taxRate > 0 ? Math.round((amount / (1 + taxRate / 100)) * 100) / 100 : amount;
                const taxAmount = Math.round((amount - baseAmount) * 100) / 100;
                const newTotalDue = Math.round((amount + carryOver) * 100) / 100;
                
                const startSeq = await InvoiceService.getNextInvoiceNumberVal();
                const invoiceNumber = InvoiceService.formatInvoiceNumber(startSeq);

                const newInvoice = new Invoice({
                    invoiceNumber,
                    customer: customer._id,
                    driver: driver._id,
                    vehicle: driver.currentVehicle._id || driver.currentVehicle,
                    weekNumber: nextPeriod.weekNumber,
                    weekLabel: nextPeriod.weekLabel,
                    dueDate: nextPeriod.dueDate,
                    baseAmount,
                    carryOverAmount: carryOver,
                    tax: activeTax ? activeTax._id : undefined,
                    taxRate,
                    taxAmount,
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
                console.log(`[InvoiceCronService] SUCCESS: Created invoice ${newInvoice.invoiceNumber} for ${driver.driverId} (Week ${nextPeriod.weekNumber})`);

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
                driverGenerated++;
                // Set this newly created invoice as lastInvoice for the next iteration
                lastInvoice = newInvoice;
            }

            if (driverGenerated > 0) {
                console.log(`[InvoiceCronService] Driver ${driver.driverId}: Generated ${driverGenerated} catch-up invoices.`);
            }
        } catch (err) {
            console.error(`[InvoiceCronService] Error processing driver ${driver.driverId}:`, err);
        }
    }

    try {
        console.log('[InvoiceCronService] Checking for overdue invoices immediately after generation...');
        await exports.checkOverdueInvoices();
    } catch (overdueErr) {
        console.error('[InvoiceCronService] Error running checkOverdueInvoices after generation:', overdueErr);
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

const {
    addDriverService,
    getDriversService,
    getDriverByIdService,
    getDriverByEmailService,
    updateDriverService,
    deleteDriverService,
} = require("../Repo/DriverRepo");
const { getNextDriverId } = require("../../SystemSettings/Model/CounterModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const InvoiceService = require("../../Invoice/Service/InvoiceService");

// ─── Fields that CANNOT be set via the edit endpoint ──────────────────
const BLOCKED_FIELDS = [
    "status", "statusHistory", "creditCheck", "rejection",
    "activation", "suspension", "contract",
];

/**
 * Creates a new driver profile with DRAFT status.
 * Auto-generates a unique OLA-XXXXXX Driver ID.
 */
exports.create = async (data) => {
    // Auto-generate Driver ID if not already provided (migration may pre-set it)
    if (!data.driverId) {
        data.driverId = await getNextDriverId();
    }

    data.status = data.status || "DRAFT";
    data.statusHistory = [{
        status: data.status,
        changedBy: data.createdBy,
        changedByRole: data.creatorRole,
        timestamp: new Date(),
        notes: data.status === "ACTIVE" ? "Driver migrated from legacy system." : "Driver application initiated.",
    }];
    return await addDriverService(data);
};

exports.getAll = async (queryParams = {}, options = {}) => {
    const finalOptions = {
        baseQuery: { isDeleted: false },
        defaultSort: { createdAt: -1 },
        ...options
    };
    return await getDriversService(queryParams, finalOptions);
};

/**
 * Retrieves a driver by ID.
 * @param {string} id
 * @param {Object} options - { includeSensitive: bool }
 */
exports.getById = async (id, options = {}) => {
    // Before returning, ensure any overdue rent is rolled over correctly
    await exports.rolloverOverdueRent(id);
    return await getDriverByIdService(id, options);
};

/**
 * Retrieves a driver by Email.
 * @param {string} email
 * @param {Object} options - { includeSensitive: bool }
 */
exports.getByEmail = async (email, options = {}) => {
    const driver = await getDriverByEmailService(email, options);
    if (driver) {
        await exports.rolloverOverdueRent(driver._id);
        // fetch again to get updated roll over rent
        return await getDriverByEmailService(email, options);
    }
    return null;
};

/**
 * Updates non-workflow fields on a driver (e.g. personal info edits).
 * Does NOT change status — use the workflow service for that.
 * Blocks sensitive/workflow fields from being injected.
 */
exports.update = async (id, data) => {
    // Strip all workflow-controlled and sensitive fields
    for (const field of BLOCKED_FIELDS) {
        delete data[field];
    }
    return await updateDriverService(id, data);
};

/**
 * Soft-deletes a driver.
 */
exports.remove = async (id) => {
    return await deleteDriverService(id);
};

/**
 * Record a payment and distribute it across weeks, ALWAYS starting from the oldest unpaid week
 * to ensure past debts are cleared first and overpayments flow into future weeks.
 */
exports.payRent = async (id, paymentData) => {
    console.log(`[DriverService] payRent called for driver ${id} with data:`, JSON.stringify(paymentData));
    const { amount, paymentMethod, transactionId, note, createdBy, creatorRole } = paymentData;
    
    if (!amount || amount <= 0) throw new Error("Payment amount must be greater than 0");

    // Heal data first to ensure unique weekNumbers
    const driver = await exports.deduplicateRentTracking(id);
    if (!driver || !driver.rentTracking) throw new Error("Driver or rent tracking not found");

    // Sort to ensuring we iterate in chronological order
    const tracking = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);
    
    let remainingAmount = amount;
    const updates = {};
    const timestamp = new Date();

    // Find the EARLIEST week that is not PAID
    const startIndex = tracking.findIndex(r => r.status !== "PAID");
    if (startIndex === -1) {
        // All weeks paid? Apply to the very last week anyway as a surplus or just throw?
        // Let's assume we can always apply to the last week if everything is paid.
        throw new Error("All scheduled rent installments are already fully paid.");
    }

    const firstEffectiveWeekNum = tracking[startIndex].weekNumber;
    const paidWeeks = [];

    for (let i = startIndex; i < tracking.length; i++) {
        if (remainingAmount <= 0) break;

        const week = tracking[i];
        const originalIndex = driver.rentTracking.findIndex(r => r.weekNumber === week.weekNumber);
        
        // Use amount + current carryOver as the target for this specific installment
        const currentAmount = week.amount;
        const currentCarryOver = week.carryOver || 0;
        const totalDue = currentAmount + currentCarryOver;
        const currentPaid = week.amountPaid || 0;
        const currentBalance = Math.max(0, totalDue - currentPaid);

        // How much can we apply to this week?
        const paymentForThisWeek = Math.min(currentBalance, remainingAmount);

        if (paymentForThisWeek <= 0) continue;
        paidWeeks.push(`Wk${week.weekNumber}`);

        const newPaid = currentPaid + paymentForThisWeek;
        const newBalance = Math.max(0, totalDue - newPaid);
        let newStatus = "PENDING";
        if (newBalance <= 0) newStatus = "PAID";
        else if (newPaid > 0) newStatus = "PARTIAL";

        // Queue updates for this week
        updates[`rentTracking.${originalIndex}.amountPaid`] = newPaid;
        updates[`rentTracking.${originalIndex}.balance`] = newBalance;
        updates[`rentTracking.${originalIndex}.status`] = newStatus;
        if (newStatus === "PAID" && !week.paidAt) {
            updates[`rentTracking.${originalIndex}.paidAt`] = timestamp;
        }

        // Add payment record
        const paymentRecord = {
            amount: paymentForThisWeek,
            paidAt: timestamp,
            paymentMethod: paymentMethod || "Cash",
            transactionId: transactionId || undefined,
            note: (week.weekNumber !== firstEffectiveWeekNum) 
                ? `Applied from payment starting at Week ${firstEffectiveWeekNum}. ${note || ''}` 
                : note,
        };

        if (!updates.$push) updates.$push = {};
        updates.$push[`rentTracking.${originalIndex}.payments`] = paymentRecord;

        remainingAmount -= paymentForThisWeek;
    }

    // Capture any leftover amount if the payment exceeded even the VERY last week (extreme case)
    if (remainingAmount > 0) {
        // Just add it to the last week's amountPaid/balance (it will go negative balance)
        // or just stop. For now, we stop as we only have a finite schedule.
    }

    await updateDriverService(id, updates);

    // Create Ledger & Payment Transaction
    try {
        console.log(`[DriverService] Starting ledger generation for driver ${id}`);
            const accCode = await AccountingCode.findOne({ code: "4100" });
            console.log(`[DriverService] AccountingCode 4100 found: ${!!accCode}`);
            if (accCode) {
                const driverName = driver.personalInfo?.fullName || "Unknown Driver";
                console.log(`[DriverService] Driver Name: ${driverName}`);
                let vehicleDesc = "Unassigned Vehicle";
                if (driver.currentVehicle) {
                    const vehicle = await Vehicle.findById(driver.currentVehicle);
                    if (vehicle) {
                        vehicleDesc = `${vehicle.basicDetails?.make || ''} ${vehicle.basicDetails?.model || ''} (${vehicle.legalDocs?.registrationNumber || vehicle.basicDetails?.vin || 'No Reg'})`.trim();
                    }
                }
                console.log(`[DriverService] Vehicle Description: ${vehicleDesc}`);
                
                const weekNote = paidWeeks.length > 0 ? ` for ${paidWeeks.join(', ')}` : '';
                const enhancedNote = `Rent Payment${weekNote} by ${driverName} [${vehicleDesc}]${note ? ' - ' + note : ''}`;

                // Map paymentMethod to match the PaymentTransaction enum
                let normalizedMethod = "OTHER";
                const methodUpper = paymentMethod ? paymentMethod.toUpperCase() : "CASH";
                
                if (methodUpper.includes("CASH")) normalizedMethod = "CASH";
                else if (methodUpper.includes("BANK") || methodUpper.includes("TRANSFER")) normalizedMethod = "BANK_TRANSFER";
                else if (methodUpper.includes("CARD")) normalizedMethod = "CREDIT_CARD";
                else if (methodUpper.includes("CHEQUE")) normalizedMethod = "CHEQUE";

                const transactionData = {
                    accountingCode: accCode._id,
                    referenceId: id,
                    referenceModel: "Driver",
                    transactionCategory: "INCOME",
                    transactionType: "CREDIT",
                    isTaxInclusive: false,
                    baseAmount: amount,
                    totalAmount: amount,
                    paymentMethod: normalizedMethod,
                    status: "COMPLETED",
                    paymentDate: timestamp,
                    notes: enhancedNote,
                    createdBy,
                    creatorRole
                };
                console.log(`[DriverService] Creating PaymentTransaction for driver ${id}, amount ${amount}`);
                const newTransaction = await PaymentTransaction.create(transactionData);
                console.log(`[DriverService] PaymentTransaction created: ${newTransaction._id}`);
                
                const populatedTx = { ...newTransaction.toObject(), accountingCode: accCode };
                await LedgerService.autoGenerateLedgerEntry(populatedTx);
                console.log(`[DriverService] Ledger entry generation triggered for ${newTransaction._id}`);

                // Zoho Accounting Integration: Auto-create PaymentReceived record for Direct Rent Payment
                try {
                    const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
                    const prData = {
                        paymentNumber: `PR-${Date.now()}`,
                        driverId: id,
                        amountReceived: amount,
                        paymentDate: timestamp,
                        paymentMethod: paymentMethod || "Cash",
                        referenceNumber: transactionId || undefined,
                        notes: enhancedNote,
                        invoices: [], // Recorded as unapplied balance against general rent tracking
                        status: "COMPLETED"
                    };
                    const prDoc = await PaymentReceived.create(prData);
                    console.log(`[DriverService] PaymentReceived record created successfully: ${prDoc.paymentNumber}`);
                } catch (prErr) {
                    console.error("[DriverService] Failed to auto-create PaymentReceived record:", prErr);
                }
            }
        } catch (err) {
            console.error("[DriverService] Failed to generate ledger for rent payment:", err);
        }

    // After payment distribution, recalculate carryovers for the remaining timeline
    return await exports.rolloverOverdueRent(id);
};

/**
 * Self-healing mechanism to merge duplicate week entries in rentTracking.
 * If multiple entries exist for the same weekNumber, they are merged into one.
 */
exports.deduplicateRentTracking = async (driverId) => {
    const driver = await getDriverByIdService(driverId);
    if (!driver || !driver.rentTracking || driver.rentTracking.length === 0) return driver;

    const seenWeeks = new Map();
    let hasDuplicates = false;
    const mergedTracking = [];

    for (const week of driver.rentTracking) {
        if (!seenWeeks.has(week.weekNumber)) {
            seenWeeks.set(week.weekNumber, { ...week.toObject ? week.toObject() : week });
            mergedTracking.push(seenWeeks.get(week.weekNumber));
        } else {
            hasDuplicates = true;
            const existing = seenWeeks.get(week.weekNumber);
            
            // Merge logic:
            // 1. Sum up amountPaid
            existing.amountPaid = (existing.amountPaid || 0) + (week.amountPaid || 0);
            
            // 2. Combine payments arrays
            if (week.payments && week.payments.length > 0) {
                existing.payments = [...(existing.payments || []), ...week.payments];
            }
            
            // 3. Keep the most accurate carryOver (usually one will be 0)
            existing.carryOver = Math.max(existing.carryOver || 0, week.carryOver || 0);

            // 4. Recalculate totalDue and balance
            existing.totalDue = existing.amount + existing.carryOver;
            existing.balance = Math.max(0, existing.totalDue - existing.amountPaid);

            // 5. Update status
            if (existing.balance === 0) existing.status = 'PAID';
            else if (existing.amountPaid > 0) existing.status = 'PARTIAL';
            else existing.status = 'PENDING';

            // 6. Update paidAt if now paid
            if (existing.status === 'PAID' && !existing.paidAt) {
                existing.paidAt = week.paidAt || new Date();
            }
        }
    }

    if (hasDuplicates) {
        console.log(`Self-healing: Deduplicating rent records for driver ${driverId}`);
        return await updateDriverService(driverId, {
            $set: { rentTracking: mergedTracking }
        });
    }
    return driver;
};

/**
 * Roll over any overdue unpaid balance into the next pending week.
 * Called when needed (e.g., on a cron job or before displaying rent info).
 */
exports.rolloverOverdueRent = async (driverId) => {
    // First, heal any duplicate data issues
    const driver = await exports.deduplicateRentTracking(driverId);
    
    if (!driver || !driver.rentTracking || driver.rentTracking.length === 0) return driver;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sort by weekNumber ascending
    const sorted = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);

    let totalCarryOver = 0;
    const updates = {};

    for (let i = 0; i < sorted.length; i++) {
        const week = sorted[i];
        const originalIndex = driver.rentTracking.findIndex(r => r.weekNumber === week.weekNumber);
        const dueDate = week.dueDate ? new Date(week.dueDate) : null;
        const isOverdue = dueDate && dueDate < today;

        if (week.status !== "PAID" && isOverdue) {
            // This week is overdue — calculate remaining balance
            const weekTotalDue = week.totalDue || (week.amount + (week.carryOver || 0));
            const weekPaid = week.amountPaid || 0;
            const weekBalance = weekTotalDue - weekPaid;

            if (weekBalance > 0) {
                totalCarryOver += weekBalance;
            }
        } else if (week.status !== "PAID" && !isOverdue) {
            // First non-overdue pending week — apply accumulated carryOver (can be 0)
            const newCarryOver = totalCarryOver;
            const newTotalDue = week.amount + newCarryOver;
            const newBalance = newTotalDue - (week.amountPaid || 0);

            // Only queue update if values changed
            if (week.carryOver !== newCarryOver || week.totalDue !== newTotalDue) {
                updates[`rentTracking.${originalIndex}.carryOver`] = newCarryOver;
                updates[`rentTracking.${originalIndex}.totalDue`] = newTotalDue;
                updates[`rentTracking.${originalIndex}.balance`] = newBalance;
            }

            totalCarryOver = 0; // Reset after applying
            break; // Only apply to the first upcoming week
        }
    }

    if (Object.keys(updates).length > 0) {
        return await updateDriverService(driverId, updates);
    }

    return driver;
};

/**
 * Generate a rent plan for a driver (Weekly or Monthly).
 * - Monthly: Due on the 1st of every month, starting the month after assignment.
 * - Weekly: Due on every Wednesday.
 */
exports.generateRentPlan = async (driverId, { monthlyRent, weeklyRent, durationMonths, durationWeeks, frequency = 'MONTHLY' }, session = null) => {
    const installments = [];
    const assignmentDate = new Date();
    assignmentDate.setHours(0, 0, 0, 0);

    const isWeekly = frequency.toUpperCase() === 'WEEKLY';
    const amount = isWeekly ? (weeklyRent || Math.ceil(monthlyRent / 4)) : monthlyRent;
    const count = isWeekly ? (durationWeeks || durationMonths * 4) : durationMonths;

    let nextDueDate = new Date(assignmentDate);

    if (isWeekly) {
        // Set to the first Wednesday after assignment
        // day 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
        const currentDay = nextDueDate.getDay();
        const daysUntilWed = (3 - currentDay + 7) % 7;
        const offset = daysUntilWed === 0 ? 7 : daysUntilWed; // If today is Wed, next Wed is 7 days away
        nextDueDate.setDate(nextDueDate.getDate() + offset);
    } else {
        // Monthly: 1st of the month after assignment
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        nextDueDate.setDate(1);
    }

    for (let i = 0; i < count; i++) {
        const dueDate = new Date(nextDueDate);
        if (isWeekly) {
            dueDate.setDate(nextDueDate.getDate() + (i * 7));
        } else {
            dueDate.setMonth(nextDueDate.getMonth() + i);
            dueDate.setDate(1); // Ensure it's always the 1st
        }
        
        const periodNum = i + 1;
        installments.push({
            weekNumber: periodNum,
            weekLabel: isWeekly 
                ? `Week ${periodNum} - ${dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                : `Month ${periodNum} - ${dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            dueDate: dueDate,
            amount: amount,
            carryOver: 0,
            totalDue: amount,
            amountPaid: 0,
            balance: amount,
            status: "PENDING",
            payments: [],
        });
    }

    // Replace the entire rentTracking to avoid duplicates on re-assignment
    const updatedDriver = await updateDriverService(driverId, {
        $set: { rentTracking: installments }
    }, session);

    // Generate Invoice documents
    const vehicleId = updatedDriver.currentVehicle || null;
    
    await InvoiceService.generateRentInvoices(
        driverId, 
        vehicleId, 
        amount, 
        count, 
        frequency, 
        updatedDriver.createdBy, 
        updatedDriver.creatorRole, 
        session
    );

    return updatedDriver;
};

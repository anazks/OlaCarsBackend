const mongoose = require('mongoose');
const Customer = require('../../Customer/Model/CustomerModel');
const { Invoice } = require('../../Invoice/Model/InvoiceModel');
const PaymentReceived = require('../Model/PaymentReceivedModel');
const PaymentTransaction = require('../../Payment/Model/PaymentTransactionModel');
const AccountingCode = require('../../AccountingCode/Model/AccountingCodeModel');
const Branch = require('../../Branch/Model/BranchModel');
const InvoiceService = require('../../Invoice/Service/InvoiceService');
const { autoGenerateLedgerEntry } = require('../../Ledger/Service/LedgerService');
const LedgerEntry = require('../../Ledger/Model/LedgerEntryModel');

/**
 * Normalizes a string for case-insensitive, whitespace-agnostic comparison.
 */
const cleanString = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // remove non-alphanumeric characters
        .trim();
};

/**
 * Parses flexible dates from strings or Excel serial numbers.
 */
const parseFlexibleDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;

    // Check if it's a number or can be parsed as a number (Excel serial date)
    const num = Number(dateStr);
    if (typeof dateStr !== 'object' && !isNaN(num) && dateStr !== '' && dateStr !== null && dateStr !== true && dateStr !== false) {
        if (num > 30000 && num < 3000000) {
            const date = new Date(Math.round((num - 25569) * 86400 * 1000));
            return isNaN(date.getTime()) ? null : date;
        }
    }

    const str = dateStr.toString().trim();
    if (!str) return null;

    // Check for DD/MM/YYYY or DD-MM-YYYY format
    const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
    const match = str.match(dmyRegex);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const date = new Date(year, month, day);
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
            return date;
        }
    }

    const parsedDate = new Date(str);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
};

/**
 * Resolves creator ID and role for auditing/ledger purposes.
 */
const resolveCreator = async (user) => {
    let creatorId = user ? (user.id || user._id) : null;
    let creatorRole = user && user.role ? user.role.toUpperCase() : "ADMIN";

    if (!creatorId) {
        try {
            const User = mongoose.model('User');
            const anyUser = await User.findOne({});
            if (anyUser) {
                creatorId = anyUser._id;
                creatorRole = anyUser.role ? anyUser.role.toUpperCase() : "ADMIN";
            } else {
                creatorId = new mongoose.Types.ObjectId();
                creatorRole = "ADMIN";
            }
        } catch (e) {
            creatorId = new mongoose.Types.ObjectId();
            creatorRole = "ADMIN";
        }
    }
    return { creatorId, creatorRole };
};

/**
 * Standardizes raw row keys based on custom field mapping.
 */
const getMappedValue = (row, targetField, fieldMap) => {
    if (fieldMap && fieldMap[targetField]) {
        const customCol = fieldMap[targetField];
        if (row[customCol] !== undefined) return row[customCol];
    }

    const possibleKeys = {
        paymentNumber: ["Payment Number", "paymentNumber", "payment_number", "paymentNo", "paymentno", "payment id", "paymentid"],
        customerName: ["Customer Name", "customerName", "customer_name", "customer", "client", "driver name", "driver"],
        customerNumber: ["Customer ID", "customerId", "customer_id", "Customer Number", "customerNumber", "customer_number", "phone"],
        amountReceived: ["Amount Received", "amountReceived", "amount_received", "Amount", "amount", "total amount", "total"],
        paymentDate: ["Payment Date", "paymentDate", "payment_date", "Date", "date", "Created Time", "createdTime"],
        paymentMethod: ["Payment Method", "paymentMethod", "payment_method", "Mode", "mode", "Payment Type", "paymentType"],
        referenceNumber: ["Reference Number", "referenceNumber", "reference_number", "Ref", "ref", "reference"],
        notes: ["Notes", "notes", "Description", "description", "memo"],
        invoiceNumber: ["Invoice Number", "invoiceNumber", "invoice_number", "Invoice", "invoice"],
        amountApplied: ["Amount Applied to Invoice", "amountApplied", "amount_applied", "Amount Applied", "amountapplied"],
        depositTo: ["Deposit To", "depositTo", "deposit_to", "Deposit To Account Code", "depositToAccountCode", "account"],
        branch: ["Branch", "branch", "Branch ID", "branchId", "Location Name", "locationName"]
    }[targetField] || [targetField];

    for (const key of possibleKeys) {
        if (row[key] !== undefined) return row[key];
        const lowerKey = key.toLowerCase();
        for (const rk of Object.keys(row)) {
            if (rk.toLowerCase().trim() === lowerKey) {
                return row[rk];
            }
        }
    }
    return undefined;
};

const mapLimit = async (array, limit, fn) => {
    const results = [];
    const executing = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);
        if (limit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
};

/**
 * Main reconciliation service for Payment Received bulk upload.
 */
exports.importAndReconcilePayments = async ({ rows, fieldMap, user }) => {
    const session = undefined; // Proceed without transaction session to avoid write conflicts
    let isTransactionActive = false;

    const summary = {
        processedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        extraCount: 0,
        totalExtraAmount: 0,
        errors: [],
        skipped: []
    };

    try {
        const { creatorId, creatorRole } = await resolveCreator(user);

        // --- PHASE 1: Collect unique identifiers for targeted DB queries ---
        const uniquePaymentNumbers = new Set();
        const uniqueInvoiceNumbers = new Set();
        const uniqueCustomerNames = new Set();
        const uniqueCustomerNumbers = new Set();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const payNo = getMappedValue(row, 'paymentNumber', fieldMap);
            const invNo = getMappedValue(row, 'invoiceNumber', fieldMap);
            const custName = getMappedValue(row, 'customerName', fieldMap);
            const custNo = getMappedValue(row, 'customerNumber', fieldMap);

            if (payNo) uniquePaymentNumbers.add(payNo.toString().trim());
            if (invNo) uniqueInvoiceNumbers.add(invNo.toString().trim());
            if (custName) uniqueCustomerNames.add(custName.toString().trim());
            if (custNo) uniqueCustomerNumbers.add(custNo.toString().trim());
        }

        // --- PHASE 2: Cache DB Collections into Memory Hash Maps ---
        const customersList = await Customer.find({ isDeleted: false });
        const customersMap = new Map();

        for (const cust of customersList) {
            if (cust.name) customersMap.set(cleanString(cust.name), cust);
            if (cust.customerId) customersMap.set(cleanString(cust.customerId), cust);
            if (cust.customerNumber) customersMap.set(cleanString(cust.customerNumber), cust);
        }

        const accCodes = await AccountingCode.find({ isDeleted: false });
        const accCodesMap = new Map();
        for (const ac of accCodes) {
            if (ac.code) accCodesMap.set(cleanString(ac.code), ac);
            if (ac.name) accCodesMap.set(cleanString(ac.name), ac);
        }

        const branches = await Branch.find({ isDeleted: false });
        const defaultBranch = branches.find(b => b.status === "ACTIVE") || (branches.length > 0 ? branches[0] : null);

        const paymentNumbersArray = Array.from(uniquePaymentNumbers);
        const existingPayments = await PaymentReceived.find({
            paymentNumber: { $in: paymentNumbersArray }
        });
        const existingPaymentsMap = new Map(existingPayments.map(p => [p.paymentNumber, p]));

        const invoiceQuery = {
            isDeleted: false,
            invoiceNumber: { $in: Array.from(uniqueInvoiceNumbers) }
        };
        const invoicesList = await Invoice.find(invoiceQuery);
        const invoicesMap = new Map(invoicesList.map(inv => [inv.invoiceNumber.trim().toLowerCase(), inv]));

        // --- PHASE 3: Group Valid Rows by Payment Number ---
        const paymentGroups = new Map();
        let unnumberedCounter = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowIndex = i + 2;

            const customerName = getMappedValue(row, 'customerName', fieldMap);
            const customerNumber = getMappedValue(row, 'customerNumber', fieldMap);
            const amountReceivedVal = getMappedValue(row, 'amountReceived', fieldMap);
            const paymentDateVal = getMappedValue(row, 'paymentDate', fieldMap);
            const invNo = getMappedValue(row, 'invoiceNumber', fieldMap);
            let paymentNumber = getMappedValue(row, 'paymentNumber', fieldMap);

            const rowErrors = [];
            if (!customerName && !customerNumber) {
                rowErrors.push("Row is missing Customer Name or Customer ID.");
            }
            if (amountReceivedVal === undefined || amountReceivedVal === null || amountReceivedVal === "") {
                rowErrors.push("Row is missing Payment Amount.");
            } else {
                const amt = parseFloat(amountReceivedVal);
                if (isNaN(amt) || amt <= 0) {
                    rowErrors.push(`Payment Amount must be a positive number.`);
                }
            }
            if (!paymentDateVal) {
                rowErrors.push("Row is missing Payment Date.");
            } else if (!parseFlexibleDate(paymentDateVal)) {
                rowErrors.push(`Payment Date is invalid.`);
            }
            if (!invNo) {
                rowErrors.push("Row is missing Invoice Number.");
            }

            let resolvedCust = null;
            if (customerName) resolvedCust = customersMap.get(cleanString(customerName));
            if (!resolvedCust && customerNumber) resolvedCust = customersMap.get(cleanString(customerNumber));

            if (!resolvedCust && (customerName || customerNumber)) {
                rowErrors.push(`Customer not found in database.`);
            }

            let invoiceDoc = null;
            if (invNo) {
                invoiceDoc = invoicesMap.get(invNo.toString().trim().toLowerCase());
                if (!invoiceDoc) {
                    rowErrors.push(`Invoice "${invNo}" not found in database.`);
                }
            }

            if (rowErrors.length > 0) {
                summary.errorCount++;
                summary.errors.push(`Row ${rowIndex}: ${rowErrors.join(" ")}`);
                continue;
            }

            if (!paymentNumber) {
                unnumberedCounter++;
                paymentNumber = `TEMP-PR-${Date.now()}-${unnumberedCounter}`;
            }

            const pNoKey = paymentNumber.toString().trim();
            if (!paymentGroups.has(pNoKey)) {
                const rawPaymentMethod = getMappedValue(row, 'paymentMethod', fieldMap) || 'Cash';
                let normalizedPaymentMethod = 'Cash';
                const cleanPm = rawPaymentMethod.toString().toLowerCase().trim();
                if (cleanPm.includes('cash')) normalizedPaymentMethod = 'Cash';
                else if (cleanPm.includes('bank') || cleanPm.includes('transfer')) normalizedPaymentMethod = 'Bank Transfer';
                else if (cleanPm.includes('card') || cleanPm.includes('visa') || cleanPm.includes('master')) normalizedPaymentMethod = 'Card';
                else if (cleanPm.includes('mobile') || cleanPm.includes('nequi') || cleanPm.includes('yappy')) normalizedPaymentMethod = 'Mobile Money';
                else normalizedPaymentMethod = 'Other';

                paymentGroups.set(pNoKey, {
                    paymentNumber: pNoKey,
                    customer: resolvedCust,
                    rowAmount: parseFloat(amountReceivedVal),
                    paymentDate: parseFlexibleDate(paymentDateVal),
                    paymentMethod: normalizedPaymentMethod,
                    referenceNumber: getMappedValue(row, 'referenceNumber', fieldMap) || '',
                    notes: getMappedValue(row, 'notes', fieldMap) || '',
                    depositTo: getMappedValue(row, 'depositTo', fieldMap),
                    branchVal: getMappedValue(row, 'branch', fieldMap),
                    rows: []
                });
            } else {
                const existingGroup = paymentGroups.get(pNoKey);
                const currentAmt = parseFloat(amountReceivedVal);
                if (!isNaN(currentAmt) && currentAmt > existingGroup.rowAmount) {
                    existingGroup.rowAmount = currentAmt;
                }
            }

            paymentGroups.get(pNoKey).rows.push({ row, rowIndex, invoiceDoc });
        }

        if (paymentGroups.size === 0) {
            return {
                success: false,
                message: "No valid rows to process.",
                summary
            };
        }

        // Proceed without MongoDB transaction to avoid lock/write conflicts across multiple tables

        // --- PHASE 4: Process Groups by Payment Number ---
        const modifiedInvoicesSet = new Set();
        let sequentialPRCounter = await PaymentReceived.countDocuments().session(session);

        // Assign final payment numbers synchronously first to avoid race conditions on sequentialPRCounter
        for (const [paymentNumber, group] of paymentGroups.entries()) {
            let finalPaymentNumber = paymentNumber;
            const isGenerated = paymentNumber.startsWith("TEMP-PR-");
            if (isGenerated) {
                sequentialPRCounter++;
                finalPaymentNumber = `PR-${String(sequentialPRCounter).padStart(5, '0')}`;
            }
            group.finalPaymentNumber = finalPaymentNumber;
        }

        const groupsArray = Array.from(paymentGroups.entries());
        await mapLimit(groupsArray, 15, async ([paymentNumber, group]) => {
            try {
                // Resolve Deposit To Account
                let depositToDoc = null;
                if (group.depositTo) {
                    depositToDoc = accCodesMap.get(cleanString(group.depositTo));
                }
                if (!depositToDoc) {
                    depositToDoc = accCodesMap.get(cleanString("1020")) ||
                        accCodesMap.get(cleanString("1030")) ||
                        accCodes.find(ac => ac.category === "ASSET");
                }
                if (!depositToDoc) {
                    summary.errorCount++;
                    summary.errors.push(`Payment ${paymentNumber}: No valid asset deposit account found.`);
                    return;
                }

                // Resolve Branch
                let resolvedBranch = null;
                if (group.branchVal) {
                    const cleanBr = cleanString(group.branchVal);
                    resolvedBranch = branches.find(b => cleanString(b.name) === cleanBr || cleanString(b.code) === cleanBr);
                }
                if (!resolvedBranch && group.customer) {
                    resolvedBranch = branches.find(b => b._id.toString() === group.customer.branch.toString());
                }
                resolvedBranch = resolvedBranch || defaultBranch;

                const finalPaymentNumber = group.finalPaymentNumber;

                // Filter out rows that are ALREADY saved on the specified invoices
                const activeApplications = [];

                // Fetch or create PaymentReceived
                let payDoc = existingPaymentsMap.get(finalPaymentNumber);
                const isExisting = !!payDoc;

                const newInvoicesList = [];
                if (isExisting && payDoc.invoices) {
                    newInvoicesList.push(...payDoc.invoices);
                }

                for (const item of group.rows) {
                    const invoiceDoc = item.invoiceDoc;
                    const amtAppliedVal = getMappedValue(item.row, 'amountApplied', fieldMap);
                    let amountApplied = parseFloat(amtAppliedVal);

                    if (isNaN(amountApplied) || amountApplied <= 0) {
                        const invPaid = invoiceDoc.payments.reduce((sum, p) => sum + p.amount, 0);
                        const invBal = Math.max(0, invoiceDoc.totalAmountDue - invPaid);
                        amountApplied = Math.min(group.rowAmount, invBal);
                    }

                    // Check if this payment number is already saved on this invoice
                    const alreadySaved = invoiceDoc.payments.some(p =>
                        p.transactionId === finalPaymentNumber ||
                        (p.note && p.note.includes(finalPaymentNumber))
                    );

                    if (alreadySaved) {
                        // Check if it is missing from PaymentReceived invoices list (broken link/inconsistency)
                        const existsInPayDoc = newInvoicesList.some(inv => inv.invoiceId.toString() === invoiceDoc._id.toString());
                        if (!existsInPayDoc) {
                            const matchingPaymentEntry = invoiceDoc.payments.find(p =>
                                p.transactionId === finalPaymentNumber ||
                                (p.note && p.note.includes(finalPaymentNumber))
                            );
                            const actualAmount = matchingPaymentEntry ? matchingPaymentEntry.amount : amountApplied;

                            newInvoicesList.push({
                                invoiceId: invoiceDoc._id,
                                invoiceNumber: invoiceDoc.invoiceNumber,
                                amountApplied: actualAmount
                            });

                            activeApplications.push({
                                invoiceDoc,
                                amountApplied: actualAmount,
                                rowIndex: item.rowIndex,
                                isRepairOnly: true
                            });
                        } else {
                            summary.skippedCount++;
                            summary.skipped.push(`Row ${item.rowIndex}: Payment "${finalPaymentNumber}" is already connected to Invoice "${invoiceDoc.invoiceNumber}". Leaving it as is.`);
                        }
                        continue;
                    }

                    activeApplications.push({
                        invoiceDoc,
                        amountApplied,
                        rowIndex: item.rowIndex,
                        isRepairOnly: false
                    });
                }

                // If all applications for this payment are skipped, skip this group entirely
                if (activeApplications.length === 0) {
                    return;
                }

                const nonRepairCount = activeApplications.filter(a => !a.isRepairOnly).length;
                summary.processedCount += nonRepairCount;

                // Apply payments to the Invoice documents
                const paymentMethodStr = group.paymentMethod || "Cash";

                for (const app of activeApplications) {
                    const invoiceDoc = app.invoiceDoc;

                    if (!app.isRepairOnly) {
                        // Push new payment entry to Invoice
                        invoiceDoc.payments.push({
                            amount: app.amountApplied,
                            paidAt: group.paymentDate,
                            paymentMethod: paymentMethodStr,
                            transactionId: finalPaymentNumber,
                            note: group.notes || `Payment received (PR: ${finalPaymentNumber})`
                        });

                        modifiedInvoicesSet.add(invoiceDoc._id.toString());
                    }

                    // Add to PaymentReceived invoices array if not already present
                    const existsInPayDoc = newInvoicesList.some(inv => inv.invoiceId.toString() === invoiceDoc._id.toString());
                    if (!existsInPayDoc) {
                        newInvoicesList.push({
                            invoiceId: invoiceDoc._id,
                            invoiceNumber: invoiceDoc.invoiceNumber,
                            amountApplied: app.amountApplied
                        });
                    } else {
                        // Update amount
                        const idx = newInvoicesList.findIndex(inv => inv.invoiceId.toString() === invoiceDoc._id.toString());
                        newInvoicesList[idx].amountApplied = app.amountApplied;
                    }
                }

                // Save PaymentReceived document
                const totalApplied = newInvoicesList.reduce((sum, inv) => sum + (inv.amountApplied || 0), 0);
                const amountReceived = Math.max(group.rowAmount || 0, totalApplied);

                const extraAmount = Math.max(0, amountReceived - totalApplied);
                if (extraAmount > 0) {
                    summary.extraCount = (summary.extraCount || 0) + 1;
                    summary.totalExtraAmount = (summary.totalExtraAmount || 0) + extraAmount;
                }

                if (isExisting) {
                    payDoc.invoices = newInvoicesList;
                    payDoc.amountReceived = amountReceived;
                    payDoc.paymentDate = group.paymentDate;
                    payDoc.paymentMethod = group.paymentMethod;
                    payDoc.referenceNumber = group.referenceNumber;
                    payDoc.notes = group.notes;
                    payDoc.depositedTo = depositToDoc._id;
                    payDoc.branch = resolvedBranch ? resolvedBranch._id : undefined;

                    await payDoc.save({ session });
                    summary.updatedCount++;
                } else {
                    payDoc = new PaymentReceived({
                        paymentNumber: finalPaymentNumber,
                        customerId: group.customer._id,
                        driverId: group.customer.driver || undefined,
                        amountReceived,
                        paymentDate: group.paymentDate,
                        paymentMethod: group.paymentMethod,
                        referenceNumber: group.referenceNumber,
                        notes: group.notes,
                        depositedTo: depositToDoc._id,
                        branch: resolvedBranch ? resolvedBranch._id : undefined,
                        invoices: newInvoicesList,
                        status: "COMPLETED"
                    });

                    await payDoc.save({ session });
                    summary.createdCount++;
                }

                // Sync with double-entry Ledger
                let paymentTx = await PaymentTransaction.findOne({
                    referenceId: payDoc._id,
                    referenceModel: "PaymentReceived"
                }).session(session);

                if (paymentTx) {
                    paymentTx.baseAmount = payDoc.amountReceived;
                    paymentTx.totalAmount = payDoc.amountReceived;
                    paymentTx.paymentDate = payDoc.paymentDate;
                    paymentTx.notes = payDoc.notes || `Payment received from Customer (PR: ${payDoc.paymentNumber})`;
                    paymentTx.accountingCode = depositToDoc._id;
                    paymentTx.branch = resolvedBranch ? resolvedBranch._id : undefined;

                    const pmUpperTx = paymentMethodStr.toUpperCase();
                    if (pmUpperTx.includes("CASH")) paymentTx.paymentMethod = "CASH";
                    else if (pmUpperTx.includes("BANK") || pmUpperTx.includes("TRANSFER")) paymentTx.paymentMethod = "BANK_TRANSFER";
                    else if (pmUpperTx.includes("CARD")) paymentTx.paymentMethod = "CREDIT_CARD";
                    else if (pmUpperTx.includes("CHEQUE")) paymentTx.paymentMethod = "CHEQUE";
                    else paymentTx.paymentMethod = "OTHER";

                    await paymentTx.save({ session });
                } else {
                    paymentTx = new PaymentTransaction({
                        accountingCode: depositToDoc._id,
                        referenceId: payDoc._id,
                        referenceModel: "PaymentReceived",
                        transactionCategory: "ASSET",
                        transactionType: "DEBIT",
                        baseAmount: payDoc.amountReceived,
                        totalAmount: payDoc.amountReceived,
                        paymentMethod: "CASH",
                        status: "COMPLETED",
                        paymentDate: payDoc.paymentDate,
                        notes: payDoc.notes || `Payment received from Customer (PR: ${payDoc.paymentNumber})`,
                        branch: resolvedBranch ? resolvedBranch._id : undefined,
                        createdBy: creatorId,
                        creatorRole: creatorRole
                    });

                    const pmUpperTx = paymentMethodStr.toUpperCase();
                    if (pmUpperTx.includes("CASH")) paymentTx.paymentMethod = "CASH";
                    else if (pmUpperTx.includes("BANK") || pmUpperTx.includes("TRANSFER")) paymentTx.paymentMethod = "BANK_TRANSFER";
                    else if (pmUpperTx.includes("CARD")) paymentTx.paymentMethod = "CREDIT_CARD";
                    else if (pmUpperTx.includes("CHEQUE")) paymentTx.paymentMethod = "CHEQUE";
                    else paymentTx.paymentMethod = "OTHER";

                    await paymentTx.save({ session });
                }

                await LedgerEntry.deleteMany({ transaction: paymentTx._id }).session(session);
                // Ledger entries are disabled for bulk import reconciliation as per user request.
            } catch (groupError) {
                console.error(`Error processing payment group ${paymentNumber}:`, groupError);
                summary.errorCount += group.rows.length;
                summary.errors.push(`Payment Group ${paymentNumber}: ${groupError.message}`);
            }
        });

        // --- PHASE 5: Recalculate Invoice Statuses, Balances & Sync ---
        const customersToRollover = new Set();
        const invoicesToSyncWithDrivers = [];

        await mapLimit(Array.from(modifiedInvoicesSet), 15, async (invoiceId) => {
            try {
                const invoiceDoc = invoicesList.find(inv => inv._id.toString() === invoiceId);
                if (invoiceDoc) {
                    // Deduplicate payment records just to ensure absolute safety
                    const seenTxIds = new Set();
                    const cleanPayments = [];

                    invoiceDoc.payments.forEach(p => {
                        if (p.transactionId) {
                            if (!seenTxIds.has(p.transactionId)) {
                                seenTxIds.add(p.transactionId);
                                cleanPayments.push(p);
                            }
                        } else {
                            cleanPayments.push(p);
                        }
                    });

                    invoiceDoc.payments = cleanPayments;
                    invoiceDoc.amountPaid = invoiceDoc.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
                    invoiceDoc.balance = Math.max(0, invoiceDoc.totalAmountDue - invoiceDoc.amountPaid);

                    if (invoiceDoc.balance <= 0) {
                        invoiceDoc.status = "PAID";
                        invoiceDoc.paidAt = invoiceDoc.payments.length > 0 ? invoiceDoc.payments[invoiceDoc.payments.length - 1].paidAt : new Date();
                    } else if (invoiceDoc.amountPaid > 0) {
                        invoiceDoc.status = "PARTIAL";
                    } else {
                        invoiceDoc.status = "PENDING";
                    }

                    await invoiceDoc.save({ session });

                    if (InvoiceService && typeof InvoiceService.syncInvoiceToAdditionalPayments === 'function') {
                        invoicesToSyncWithDrivers.push(invoiceDoc);
                    }

                    if (invoiceDoc.customer) {
                        customersToRollover.add(invoiceDoc.customer.toString());
                    }
                }
            } catch (invErr) {
                console.error(`[PaymentImportService] Failed to sync/save invoice ${invoiceId}:`, invErr);
                summary.errors.push(`Invoice Sync Error (${invoiceId}): ${invErr.message}`);
            }
        });

        // --- PHASE 6: Sync Drivers & Carryover/Rollovers ---
        if (invoicesToSyncWithDrivers.length > 0) {
            try {
                const Driver = mongoose.model('Driver');
                const invoicesByDriver = new Map();
                for (const inv of invoicesToSyncWithDrivers) {
                    if (inv.driver) {
                        const driverIdStr = inv.driver.toString();
                        if (!invoicesByDriver.has(driverIdStr)) {
                            invoicesByDriver.set(driverIdStr, []);
                        }
                        invoicesByDriver.get(driverIdStr).push(inv);
                    }
                }

                await mapLimit(Array.from(invoicesByDriver.entries()), 10, async ([driverId, driverInvoices]) => {
                    try {
                        const orConditions = [];
                        for (const inv of driverInvoices) {
                            if (inv.invoiceNumber) {
                                orConditions.push({ "additionalPayments.invoiceNumber": inv.invoiceNumber });
                            }
                            orConditions.push({ "additionalPayments.invoiceRef": inv._id });
                        }

                        const driver = await Driver.findOne({
                            _id: driverId,
                            $or: orConditions
                        }).session(session);

                        if (driver) {
                            let modified = false;
                            for (const inv of driverInvoices) {
                                const paymentItem = driver.additionalPayments.find(p =>
                                    p.invoiceNumber === inv.invoiceNumber ||
                                    (p.invoiceRef && p.invoiceRef.toString() === inv._id.toString())
                                );
                                if (paymentItem) {
                                    paymentItem.amountPaid = inv.amountPaid || 0;
                                    paymentItem.balance = inv.balance;
                                    paymentItem.status = inv.status;
                                    paymentItem.paidAt = inv.paidAt;
                                    paymentItem.payments = (inv.payments || []).map(p => ({
                                        amount: p.amount,
                                        paidAt: p.paidAt,
                                        paymentMethod: p.paymentMethod || "Cash",
                                        transactionId: p.transactionId,
                                        note: p.note
                                    }));
                                    modified = true;
                                }
                            }
                            if (modified) {
                                driver.markModified("additionalPayments");
                                await driver.save({ session });
                            }
                        }
                    } catch (driverErr) {
                        console.error(`[PaymentImportService] Failed to sync driver ${driverId}:`, driverErr);
                        summary.errors.push(`Driver Sync Error (${driverId}): ${driverErr.message}`);
                    }
                });
            } catch (driverSyncErr) {
                console.error(`[PaymentImportService] Driver list processing failed:`, driverSyncErr);
                summary.errors.push(`Driver list processing failed: ${driverSyncErr.message}`);
            }
        }

        // Roll-overs
        if (customersToRollover.size > 0 && InvoiceService && typeof InvoiceService.rolloverCustomerInvoices === 'function') {
            await mapLimit(Array.from(customersToRollover), 10, async (custId) => {
                try {
                    await InvoiceService.rolloverCustomerInvoices(custId);
                } catch (rolloverErr) {
                    console.error(`[Reconciliation] Rollover customer invoices failed for customer ${custId}:`, rolloverErr);
                }
            });
        }

        if (isTransactionActive) {
            await session.commitTransaction();
        }

        return {
            success: true,
            summary
        };

        console.error("[PaymentImportService] Error during import & reconciliation:", err);
        throw err;
    } finally {
        if (session && typeof session.endSession === 'function') {
            session.endSession();
        }
    }
};

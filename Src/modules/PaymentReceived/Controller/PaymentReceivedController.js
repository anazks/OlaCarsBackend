const PaymentReceived = require('../Model/PaymentReceivedModel');

const parsePaymentDate = (dateInput) => {
    if (!dateInput) return new Date();
    
    let dateStr = typeof dateInput === 'string' ? dateInput : '';
    if (dateStr) {
        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const day = parseInt(match[3], 10);
            
            const hasZeroTime = !dateStr.includes('T') || /T00:00:00/.test(dateStr) || /T00:00:00.000Z/.test(dateStr);
            if (hasZeroTime) {
                const dateObj = new Date();
                dateObj.setFullYear(year, month - 1, day);
                return dateObj;
            }
        }
    }
    
    const parsed = new Date(dateInput);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
};

exports.createPaymentReceived = async (req, res) => {
    try {
        const { driverId, customerId, amountReceived, paymentDate: rawPaymentDate, paymentMethod, referenceNumber, notes, depositedTo, invoices, branch } = req.body;

        let finalCustomerId = customerId;
        if (!finalCustomerId && driverId) {
            const Customer = require('../../Customer/Model/CustomerModel');
            const customerDoc = await Customer.findOne({ driver: driverId });
            if (customerDoc) {
                finalCustomerId = customerDoc._id;
            }
        }

        if (!finalCustomerId || !amountReceived || !depositedTo) {
            return res.status(400).json({ success: false, message: "Missing required fields: customerId (or driverId resolving to a customer), amountReceived, depositedTo are required." });
        }

        const paymentDate = parsePaymentDate(rawPaymentDate);
        const mongoose = require('mongoose');

        // 1. Generate sequential PR number
        const count = await PaymentReceived.countDocuments();
        const paymentNumber = `PR-${String(count + 1).padStart(5, '0')}`;

        // 2. Create PaymentReceived document
        const newDoc = new PaymentReceived({
            paymentNumber,
            customerId: finalCustomerId,
            driverId: driverId || undefined,
            amountReceived,
            paymentDate,
            paymentMethod: paymentMethod || "Cash",
            referenceNumber,
            notes,
            depositedTo,
            branch,
            invoices: invoices || [],
            status: "COMPLETED"
        });

        const savedDoc = await newDoc.save();

        // 3. Update applied Invoices (if any)
        if (invoices && invoices.length > 0) {
            const { Invoice } = require('../../Invoice/Model/InvoiceModel');
            const InvoiceService = require('../../Invoice/Service/InvoiceService');
            for (const inv of invoices) {
                const invoice = await Invoice.findById(inv.invoiceId);
                if (invoice) {
                    invoice.amountPaid = (invoice.amountPaid || 0) + inv.amountApplied;
                    invoice.balance = Math.max(0, invoice.totalAmountDue - invoice.amountPaid);
                    if (invoice.balance <= 0) {
                        invoice.status = "PAID";
                        invoice.paidAt = new Date();
                    } else {
                        invoice.status = "PARTIAL";
                    }
                    // Add payment item to payments array
                    invoice.payments.push({
                        amount: inv.amountApplied,
                        paidAt: paymentDate,
                        paymentMethod: paymentMethod || "Cash",
                        note: notes || `Payment received (PR: ${paymentNumber})`
                    });
                    await invoice.save();
                    await InvoiceService.syncInvoiceToAdditionalPayments(invoice);
                    console.log(`[PaymentReceivedController] Settled $${inv.amountApplied} on Invoice ${invoice.invoiceNumber}. Remaining Balance: $${invoice.balance}`);
                }
            }
        }

        // Apply excess prepayment overpayments to future/next outstanding invoices chronologically
        const totalApplied = invoices ? invoices.reduce((sum, inv) => sum + inv.amountApplied, 0) : 0;
        const excessAmount = amountReceived - totalApplied;
        if (excessAmount > 0) {
            try {
                const InvoiceService = require('../../Invoice/Service/InvoiceService');
                await InvoiceService.applyExcessToNextInvoice(finalCustomerId, excessAmount, {
                    paymentMethod,
                    referenceNumber,
                    notes,
                    createdBy: creatorId,
                    creatorRole: creatorRole
                });
            } catch (err) {
                console.error("[PaymentReceivedController] Failed to apply excess overpayment to subsequent invoices:", err);
            }
        }

        // Always recompute carryover and rollover customer invoices to maintain clean records
        try {
            const InvoiceService = require('../../Invoice/Service/InvoiceService');
            await InvoiceService.rolloverCustomerInvoices(finalCustomerId);
        } catch (err) {
            console.error("[PaymentReceivedController] Rollover customer invoices failed:", err);
        }

        // 4. Post Double-Entry Ledger through PaymentTransaction
        let creatorId = req.user ? (req.user.id || req.user._id) : null;
        let creatorRole = req.user && req.user.role ? req.user.role.toUpperCase() : "ADMIN";
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

        const PaymentTransaction = require('../../Payment/Model/PaymentTransactionModel');
        const paymentTx = new PaymentTransaction({
            accountingCode: depositedTo,
            referenceId: savedDoc._id,
            referenceModel: "PaymentReceived",
            transactionCategory: "ASSET",
            transactionType: "DEBIT",
            baseAmount: amountReceived,
            totalAmount: amountReceived,
            paymentMethod: "CASH",
            status: "COMPLETED",
            paymentDate: paymentDate,
            notes: notes || `Payment received from Customer (PR: ${paymentNumber})`,
            branch,
            createdBy: creatorId,
            creatorRole: creatorRole
        });

        // Normalize paymentMethod for PaymentTransaction enum: ["CASH", "BANK_TRANSFER", "CREDIT_CARD", "CHEQUE", "OTHER"]
        const pmUpper = (paymentMethod || "").toUpperCase();
        if (pmUpper.includes("CASH")) paymentTx.paymentMethod = "CASH";
        else if (pmUpper.includes("BANK") || pmUpper.includes("TRANSFER")) paymentTx.paymentMethod = "BANK_TRANSFER";
        else if (pmUpper.includes("CARD")) paymentTx.paymentMethod = "CREDIT_CARD";
        else if (pmUpper.includes("CHEQUE")) paymentTx.paymentMethod = "CHEQUE";
        else paymentTx.paymentMethod = "OTHER";

        await paymentTx.save();

        // Trigger Ledger double-entry booking
        const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accCode = await AccountingCode.findById(depositedTo);
        const populatedTx = { ...paymentTx.toObject(), accountingCode: accCode };
        await autoGenerateLedgerEntry(populatedTx);

        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        console.error("[PaymentReceivedController] Error recording payment received:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllPaymentReceiveds = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sortBy, sortOrder, paymentMethod, driverId, customerId } = req.query;
        console.log('PaymentReceived Query Params:', { page, limit, search, sortBy, sortOrder, paymentMethod, driverId, customerId });
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {};
        if (paymentMethod && paymentMethod !== 'ALL') {
            query.paymentMethod = paymentMethod;
        }

        if (driverId) {
            query.driverId = driverId;
        }

        if (customerId) {
            query.customerId = customerId;
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };

            // Find matching drivers
            const { Driver } = require('../../Driver/Model/DriverModel');
            const drivers = await Driver.find({
                $or: [
                    { "personalInfo.fullName": searchRegex },
                    { "driverId": searchRegex }
                ]
            }).select('_id');
            const driverIds = drivers.map(d => d._id);

            // Find matching customers
            const Customer = require('../../Customer/Model/CustomerModel');
            const customers = await Customer.find({
                $or: [
                    { "name": searchRegex },
                    { "customerId": searchRegex }
                ]
            }).select('_id');
            const customerIds = customers.map(c => c._id);

            query.$or = [
                { paymentNumber: searchRegex },
                { referenceNumber: searchRegex },
                { driverId: { $in: driverIds } },
                { customerId: { $in: customerIds } }
            ];
        }

        let sort = { createdAt: -1 };
        if (sortBy) {
            sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        const total = await PaymentReceived.countDocuments(query);
        const docs = await PaymentReceived.find(query)
            .populate('customerId', 'name customerId')
            .populate('driverId', 'personalInfo driverId')
            .populate('depositedTo', 'name code')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: docs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPaymentReceivedById = async (req, res) => {
    try {
        const doc = await PaymentReceived.findById(req.params.id)
            .populate('customerId', 'name customerId email phone branch')
            .populate('driverId', 'personalInfo driverId')
            .populate('depositedTo', 'name code');
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updatePaymentReceived = async (req, res) => {
    try {
        const updatedDoc = await PaymentReceived.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deletePaymentReceived = async (req, res) => {
    try {
        const deletedDoc = await PaymentReceived.findByIdAndDelete(req.params.id);
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.bulkUploadPayments = async (req, res) => {
    try {
        const { rows } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No data rows provided." });
        }

        const mongoose = require('mongoose');
        const Customer = require('../../Customer/Model/CustomerModel');
        const AccountingCode = require('../../AccountingCode/Model/AccountingCodeModel');
        const Branch = require('../../Branch/Model/BranchModel');
        const { Invoice } = require('../../Invoice/Model/InvoiceModel');
        const InvoiceService = require('../../Invoice/Service/InvoiceService');
        const PaymentTransaction = require('../../Payment/Model/PaymentTransactionModel');
        const { autoGenerateLedgerEntry } = require('../../Ledger/Service/LedgerService');

        // 1. Fetch reference collections for fast lookups
        const customersList = await Customer.find({ isDeleted: false });
        const customersByName = new Map();
        const customersById = new Map();
        for (const c of customersList) {
            if (c.name) {
                customersByName.set(c.name.trim().toLowerCase().replace(/\s+/g, ' '), c);
            }
            if (c.customerId) {
                customersById.set(c.customerId.trim().toLowerCase(), c);
            }
            if (c.customerNumber) {
                customersById.set(c.customerNumber.trim().toLowerCase(), c);
            }
        }

        const accCodes = await AccountingCode.find({ isDeleted: false, isActive: true });
        const accCodesByCode = new Map();
        const accCodesByName = new Map();
        for (const ac of accCodes) {
            if (ac.code) {
                accCodesByCode.set(ac.code.toString().trim().toLowerCase(), ac);
            }
            if (ac.name) {
                accCodesByName.set(ac.name.toString().trim().toLowerCase().replace(/\s+/g, ' '), ac);
            }
        }

        const branches = await Branch.find({ isDeleted: false, status: "ACTIVE" });
        const defaultBranchId = branches[0] ? branches[0]._id : undefined;

        const invoicesList = await Invoice.find({ isDeleted: false });
        const invoicesByNo = new Map();
        for (const inv of invoicesList) {
            if (inv.invoiceNumber) {
                invoicesByNo.set(inv.invoiceNumber.trim().toLowerCase(), inv);
            }
        }

        // Helpers
        const getRowVal = (r, possibleKeys) => {
            for (const key of possibleKeys) {
                const cleanKey = key.replace(/^\ufeff/, '').trim().toLowerCase();
                if (r[key] !== undefined) return r[key];
                for (const k of Object.keys(r)) {
                    const cleanK = k.replace(/^\ufeff/, '').trim().toLowerCase();
                    if (cleanK === cleanKey) {
                        return r[k];
                    }
                }
            }
            return undefined;
        };

        const parseFlexibleDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
            if (typeof dateStr === 'number') {
                const date = new Date((dateStr - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date;
            }
            const str = dateStr.toString().trim();
            if (!str) return null;
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

        // 2. Group rows by Payment Number / CustomerPayment ID
        const paymentGroups = new Map();
        let rowCounter = 0;
        for (const row of rows) {
            rowCounter++;
            const payNo = getRowVal(row, ["Payment Number", "paymentNumber"]);
            const payId = getRowVal(row, ["CustomerPayment ID", "customerPaymentId"]);
            const key = (payNo || payId || `TEMP-${Date.now()}-${rowCounter}`).toString().trim();
            if (!paymentGroups.has(key)) {
                paymentGroups.set(key, []);
            }
            paymentGroups.get(key).push({ row, originalIndex: rowCounter });
        }

        const createdPayments = [];
        const errors = [];
        const skipped = [];
        let generatedOffset = 0;

        let creatorId = req.user ? (req.user.id || req.user._id) : null;
        let creatorRole = req.user && req.user.role ? req.user.role.toUpperCase() : "ADMIN";
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

        // 3. Process each group
        for (const [key, grouped] of paymentGroups.entries()) {
            const headerRowObj = grouped[0];
            const headerRow = headerRowObj.row;
            const origIdx = headerRowObj.originalIndex;

            const payNoVal = getRowVal(headerRow, ["Payment Number", "paymentNumber"]);
            const payNo = (payNoVal || "").toString().trim();

            // Check if payment already exists in DB
            if (payNo && !payNo.startsWith("TEMP-")) {
                const existingPayment = await PaymentReceived.findOne({ paymentNumber: payNo });
                if (existingPayment) {
                    console.log(`[PaymentReceivedController] Payment ${payNo} already exists. Skipping.`);
                    skipped.push(`Payment group "${key}" (Row ${origIdx}): Payment number "${payNo}" already exists. Skipping upload.`);
                    continue;
                }
            }

            // Resolve Customer
            const customerNameVal = getRowVal(headerRow, ["Customer Name", "customerName", "customer"]);
            const customerNameInput = (customerNameVal || "").toString().trim().toLowerCase().replace(/\s+/g, ' ');

            let customerDoc = null;
            if (customerNameInput) {
                customerDoc = customersByName.get(customerNameInput);
                if (!customerDoc) {
                    for (const [dbName, dbCust] of customersByName.entries()) {
                        const cleanDb = dbName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
                        const cleanInput = customerNameInput.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
                        if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                            customerDoc = dbCust;
                            break;
                        }
                    }
                }
            }

            if (!customerDoc) {
                const customerIdVal = getRowVal(headerRow, ["Customer ID", "customerId", "customerNumber"]);
                const customerNumberVal = getRowVal(headerRow, ["Customer Number", "customerNumber"]);
                if (customerIdVal) {
                    customerDoc = customersById.get(customerIdVal.toString().trim().toLowerCase());
                }
                if (!customerDoc && customerNumberVal) {
                    customerDoc = customersById.get(customerNumberVal.toString().trim().toLowerCase());
                }
            }

            if (!customerDoc) {
                errors.push(`Payment group "${key}" (Row ${origIdx}): Customer Name "${customerNameVal || ''}" not found in database.`);
                continue;
            }

            const driverId = customerDoc.driver || undefined;

            // Resolve Deposit To Account
            const depToVal = getRowVal(headerRow, ["Deposit To", "depositTo"]);
            const depToCodeVal = getRowVal(headerRow, ["Deposit To Account Code", "depositToAccountCode"]);

            let depositedToDoc = null;
            if (depToCodeVal) {
                depositedToDoc = accCodesByCode.get(depToCodeVal.toString().trim().toLowerCase());
            }
            if (!depositedToDoc && depToVal) {
                const cleanDepTo = depToVal.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                depositedToDoc = accCodesByName.get(cleanDepTo);
                if (!depositedToDoc) {
                    for (const [dbName, dbAc] of accCodesByName.entries()) {
                        if (dbName.includes(cleanDepTo) || cleanDepTo.includes(dbName)) {
                            depositedToDoc = dbAc;
                            break;
                        }
                    }
                }
            }

            if (!depositedToDoc) {
                errors.push(`Payment group "${key}" (Row ${origIdx}): Deposit To account "${depToVal || depToCodeVal || ''}" not found in database.`);
                continue;
            }

            // Resolve Branch
            let branchDoc = branches.find(b => b.name.toLowerCase().includes("panama"));
            if (!branchDoc) {
                const branchNameVal = getRowVal(headerRow, ["Location Name", "locationName", "Branch ID", "branchId"]);
                if (branchNameVal) {
                    const cleanBranch = branchNameVal.toString().trim().toLowerCase();
                    branchDoc = branches.find(b => b.name.toLowerCase().includes(cleanBranch) || b.code.toLowerCase() === cleanBranch);
                }
            }
            const finalBranchId = branchDoc ? branchDoc._id : defaultBranchId;

            // Resolve dates & amount
            const dateVal = getRowVal(headerRow, ["Date", "date", "Created Time", "createdTime"]);
            const paymentDate = parseFlexibleDate(dateVal) || new Date();

            const amountVal = getRowVal(headerRow, ["Amount", "amount"]);
            const amountReceived = parseFloat(amountVal || 0);
            if (isNaN(amountReceived) || amountReceived <= 0) {
                errors.push(`Payment group "${key}" (Row ${origIdx}): Invalid payment amount "${amountVal || ''}".`);
                continue;
            }

            const paymentMethodVal = getRowVal(headerRow, ["Mode", "mode", "Payment Type", "paymentType"]) || "Cash";
            let paymentMethod = "Cash";
            const pmUpper = paymentMethodVal.toString().toUpperCase();
            if (pmUpper.includes("CASH")) paymentMethod = "Cash";
            else if (pmUpper.includes("BANK") || pmUpper.includes("TRANSFER")) paymentMethod = "Bank Transfer";
            else if (pmUpper.includes("CARD")) paymentMethod = "Card";
            else if (pmUpper.includes("MOBILE") || pmUpper.includes("MONEY")) paymentMethod = "Mobile Money";
            else paymentMethod = "Other";

            const referenceNumber = getRowVal(headerRow, ["Reference Number", "referenceNumber"]) || "";
            const notes = getRowVal(headerRow, ["Description", "description", "Notes", "notes"]) || "";

            // Resolve applied invoices (sum amounts if same invoice appears multiple times in the group)
            const invoiceApplicationsMap = new Map(); // invoiceId -> { invoiceId, invoiceNumber, amountApplied }

            for (const itemObj of grouped) {
                const r = itemObj.row;
                const invNoVal = getRowVal(r, ["Invoice Number", "invoiceNumber"]);
                const amtAppliedVal = getRowVal(r, ["Amount Applied to Invoice", "amountAppliedToInvoice", "Amount Applied", "amountApplied"]);

                if (invNoVal) {
                    const invNoClean = invNoVal.toString().trim().toLowerCase();
                    const invoiceDoc = invoicesByNo.get(invNoClean);
                    if (invoiceDoc) {
                        const amountApplied = parseFloat(amtAppliedVal || 0);
                        if (!isNaN(amountApplied) && amountApplied > 0) {
                            const invIdStr = invoiceDoc._id.toString();
                            if (invoiceApplicationsMap.has(invIdStr)) {
                                // Same invoice referenced again in this payment group — sum the amounts
                                invoiceApplicationsMap.get(invIdStr).amountApplied += amountApplied;
                            } else {
                                invoiceApplicationsMap.set(invIdStr, {
                                    invoiceId: invoiceDoc._id,
                                    invoiceNumber: invoiceDoc.invoiceNumber,
                                    amountApplied
                                });
                            }
                        }
                    }
                }
            }
            const invoiceApplications = Array.from(invoiceApplicationsMap.values());

            // Assign payment number
            let paymentNumber = payNo;
            if (!paymentNumber || paymentNumber.startsWith("TEMP-")) {
                const count = await PaymentReceived.countDocuments();
                paymentNumber = `PR-${String(count + 1 + generatedOffset).padStart(5, '0')}`;
                generatedOffset++;
            }

            // Create PaymentReceived document
            const newDoc = new PaymentReceived({
                paymentNumber,
                customerId: customerDoc._id,
                driverId,
                amountReceived,
                paymentDate,
                paymentMethod,
                referenceNumber,
                notes,
                depositedTo: depositedToDoc._id,
                branch: finalBranchId,
                invoices: invoiceApplications,
                status: "COMPLETED"
            });

            const savedDoc = await newDoc.save();
            createdPayments.push(paymentNumber);

            // Update invoices in DB
            for (const app of invoiceApplications) {
                const invoice = await Invoice.findById(app.invoiceId);
                if (invoice) {
                    invoice.amountPaid = (invoice.amountPaid || 0) + app.amountApplied;
                    invoice.balance = Math.max(0, invoice.totalAmountDue - invoice.amountPaid);
                    if (invoice.balance <= 0) {
                        invoice.status = "PAID";
                        invoice.paidAt = new Date();
                    } else {
                        invoice.status = "PARTIAL";
                    }
                    invoice.payments.push({
                        amount: app.amountApplied,
                        paidAt: paymentDate,
                        paymentMethod,
                        note: notes || `Payment received (PR: ${paymentNumber})`
                    });
                    await invoice.save();
                    if (InvoiceService && typeof InvoiceService.syncInvoiceToAdditionalPayments === 'function') {
                        await InvoiceService.syncInvoiceToAdditionalPayments(invoice);
                    }
                }
            }

            // Apply excess if any
            const totalApplied = invoiceApplications.reduce((sum, inv) => sum + inv.amountApplied, 0);
            const excessAmount = amountReceived - totalApplied;
            if (excessAmount > 0) {
                try {
                    if (InvoiceService && typeof InvoiceService.applyExcessToNextInvoice === 'function') {
                        await InvoiceService.applyExcessToNextInvoice(customerDoc._id, excessAmount, {
                            paymentMethod,
                            referenceNumber,
                            notes,
                            createdBy: creatorId,
                            creatorRole: creatorRole
                        });
                    }
                } catch (err) {
                    console.error("[bulkUploadPayments] Failed to apply excess overpayment:", err);
                }
            }

            // Rollover customer invoices
            try {
                if (InvoiceService && typeof InvoiceService.rolloverCustomerInvoices === 'function') {
                    await InvoiceService.rolloverCustomerInvoices(customerDoc._id);
                }
            } catch (err) {
                console.error("[bulkUploadPayments] Rollover customer invoices failed:", err);
            }

            // Create PaymentTransaction & double-entry ledger entries
            try {
                const paymentTx = new PaymentTransaction({
                    accountingCode: depositedToDoc._id,
                    referenceId: savedDoc._id,
                    referenceModel: "PaymentReceived",
                    transactionCategory: "ASSET",
                    transactionType: "DEBIT",
                    baseAmount: amountReceived,
                    totalAmount: amountReceived,
                    paymentMethod: "CASH",
                    status: "COMPLETED",
                    paymentDate,
                    notes: notes || `Payment received from Customer (PR: ${paymentNumber})`,
                    branch: finalBranchId,
                    createdBy: creatorId,
                    creatorRole: creatorRole
                });

                const pmUpperTx = paymentMethod.toUpperCase();
                if (pmUpperTx.includes("CASH")) paymentTx.paymentMethod = "CASH";
                else if (pmUpperTx.includes("BANK") || pmUpperTx.includes("TRANSFER")) paymentTx.paymentMethod = "BANK_TRANSFER";
                else if (pmUpperTx.includes("CARD")) paymentTx.paymentMethod = "CREDIT_CARD";
                else if (pmUpperTx.includes("CHEQUE")) paymentTx.paymentMethod = "CHEQUE";
                else paymentTx.paymentMethod = "OTHER";

                await paymentTx.save();

                const populatedTx = { ...paymentTx.toObject(), accountingCode: depositedToDoc };
                await autoGenerateLedgerEntry(populatedTx);
            } catch (ledgerErr) {
                console.error(`[bulkUploadPayments] Failed to post ledger for ${paymentNumber}:`, ledgerErr);
            }
        }

        res.status(200).json({
            success: true,
            successCount: createdPayments.length,
            errorCount: errors.length,
            skippedCount: skipped.length,
            errors,
            skipped,
            createdPayments
        });
    } catch (error) {
        console.error("[PaymentReceivedController] Error in bulkUploadPayments:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


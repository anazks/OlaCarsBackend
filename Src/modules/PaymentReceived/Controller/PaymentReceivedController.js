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
        const { page = 1, limit = 10, search, sortBy, sortOrder, paymentMethod, driverId, customerId, startDate, endDate } = req.query;
        console.log('PaymentReceived Query Params:', { page, limit, search, sortBy, sortOrder, paymentMethod, driverId, customerId, startDate, endDate });
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

        if (startDate || endDate) {
            query.paymentDate = {};
            if (startDate) {
                query.paymentDate.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.paymentDate.$lte = end;
            }
        } else if (!customerId && !driverId) {
            // Default to last 30 days
            const now = new Date();
            const last30Days = new Date();
            last30Days.setDate(last30Days.getDate() - 30);
            const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            query.paymentDate = {
                $gte: last30Days,
                $lte: endOfToday
            };
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

        let sort = { paymentDate: -1 };
        if (sortBy) {
            sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        // Run pagination queries in parallel (dashboard metrics query and calculation completely removed to speed up)
        const [total, docs] = await Promise.all([
            PaymentReceived.countDocuments(query),
            PaymentReceived.find(query)
                .populate('customerId', 'name customerId')
                .populate('driverId', 'personalInfo driverId')
                .populate('depositedTo', 'name code')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
        ]);

        res.status(200).json({
            success: true,
            data: docs,
            metrics: null,
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
        const { rows, fieldMap } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No data rows provided." });
        }

        const PaymentImportService = require('../Service/PaymentImportService');
        const result = await PaymentImportService.importAndReconcilePayments({
            rows,
            fieldMap,
            user: req.user
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message || "Failed to process bulk payments.",
                errors: result.summary ? result.summary.errors : []
            });
        }

        return res.status(200).json({
            success: true,
            successCount: result.summary.createdCount + result.summary.updatedCount,
            errorCount: result.summary.errorCount,
            skippedCount: result.summary.skippedCount,
            errors: result.summary.errors,
            skipped: result.summary.skipped,
            summary: result.summary
        });
    } catch (error) {
        console.error("[PaymentReceivedController] Error in bulkUploadPayments:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


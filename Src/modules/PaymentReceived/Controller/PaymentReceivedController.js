const PaymentReceived = require('../Model/PaymentReceivedModel');

exports.createPaymentReceived = async (req, res) => {
    try {
        const { driverId, amountReceived, paymentDate, paymentMethod, referenceNumber, notes, depositedTo, invoices, branch } = req.body;

        if (!driverId || !amountReceived || !depositedTo) {
            return res.status(400).json({ success: false, message: "Missing required fields: driverId, amountReceived, depositedTo are required." });
        }

        const mongoose = require('mongoose');

        // 1. Generate sequential PR number
        const count = await PaymentReceived.countDocuments();
        const paymentNumber = `PR-${String(count + 1).padStart(5, '0')}`;

        // 2. Create PaymentReceived document
        const newDoc = new PaymentReceived({
            paymentNumber,
            driverId,
            amountReceived,
            paymentDate: paymentDate || new Date(),
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
                        paidAt: paymentDate || new Date(),
                        paymentMethod: paymentMethod || "Cash",
                        note: notes || `Payment received (PR: ${paymentNumber})`
                    });
                    await invoice.save();
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
                await InvoiceService.applyExcessToNextInvoice(driverId, excessAmount, {
                    paymentMethod,
                    referenceNumber,
                    notes
                });
            } catch (err) {
                console.error("[PaymentReceivedController] Failed to apply excess overpayment to subsequent invoices:", err);
            }
        }

        // Always recompute carryover and rollover driver invoices to maintain clean records
        try {
            const InvoiceService = require('../../Invoice/Service/InvoiceService');
            await InvoiceService.rolloverDriverInvoices(driverId);
        } catch (err) {
            console.error("[PaymentReceivedController] Rollover driver invoices failed:", err);
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
            paymentDate: paymentDate || new Date(),
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
        const { page = 1, limit = 10, search, sortBy, sortOrder, paymentMethod, driverId } = req.query;
        console.log('PaymentReceived Query Params:', { page, limit, search, sortBy, sortOrder, paymentMethod, driverId });
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {};
        if (paymentMethod && paymentMethod !== 'ALL') {
            query.paymentMethod = paymentMethod;
        }

        if (driverId) {
            query.driverId = driverId;
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

            query.$or = [
                { paymentNumber: searchRegex },
                { referenceNumber: searchRegex },
                { driverId: { $in: driverIds } }
            ];
        }

        let sort = { createdAt: -1 };
        if (sortBy) {
            sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        const total = await PaymentReceived.countDocuments(query);
        const docs = await PaymentReceived.find(query)
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

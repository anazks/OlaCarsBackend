const PaymentMade = require('../Model/PaymentMadeModel');
const mongoose = require('mongoose');

exports.createPaymentMade = async (req, res) => {
    try {
        const { supplier, amount, paymentDate, paymentMethod, paidThroughAccount, referenceNumber, notes, branch, bills } = req.body;
        
        if (!supplier || !amount || !paidThroughAccount) {
            return res.status(400).json({ success: false, message: "Missing required fields: supplier, amount, paidThroughAccount are required." });
        }

        // 1. Generate sequential PMT number
        const count = await PaymentMade.countDocuments();
        const paymentNumber = `PMT-${String(count + 1).padStart(5, '0')}`;

        // 2. Create PaymentMade document
        const newDoc = new PaymentMade({
            paymentNumber,
            supplier,
            amount,
            paymentDate: paymentDate || new Date(),
            paymentMethod: paymentMethod || "Cash",
            referenceNumber,
            notes,
            paidThroughAccount,
            branch,
            bills: bills || [],
            status: "COMPLETED"
        });

        const savedDoc = await newDoc.save();

        // 3. Update applied Bills
        if (bills && bills.length > 0) {
            const Bill = require('../../Bill/Model/BillModel');
            for (const b of bills) {
                const bill = await Bill.findById(b.billId);
                if (bill) {
                    bill.amountPaid = (bill.amountPaid || 0) + b.amountApplied;
                    if (bill.balanceDue <= 0) {
                        bill.status = "PAID";
                    } else {
                        bill.status = "PARTIALLY_PAID";
                    }
                    await bill.save();
                    console.log(`[PaymentMadeController] Settled $${b.amountApplied} on Bill ${bill.billNumber}. Remaining Balance: $${bill.balanceDue}`);
                }
            }
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
            accountingCode: paidThroughAccount,
            referenceId: savedDoc._id,
            referenceModel: "PaymentMade",
            transactionCategory: "LIABILITY",
            transactionType: "DEBIT",
            baseAmount: amount,
            totalAmount: amount,
            paymentMethod: "CASH",
            status: "COMPLETED",
            paymentDate: paymentDate || new Date(),
            notes: notes || `Payment made to Supplier (PMT: ${paymentNumber})`,
            branch,
            supplier,
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
        const accCode = await AccountingCode.findById(paidThroughAccount);
        const populatedTx = { ...paymentTx.toObject(), accountingCode: accCode };
        await autoGenerateLedgerEntry(populatedTx);

        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        console.error("[PaymentMadeController] Error recording payment made:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllPaymentMades = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sortBy, sortOrder, paymentMethod } = req.query;
        console.log('PaymentMade Query Params:', { page, limit, search, sortBy, sortOrder, paymentMethod });
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {};
        if (paymentMethod && paymentMethod !== 'ALL') {
            query.paymentMethod = paymentMethod;
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            
            // Find matching suppliers
            const Supplier = require('../../Supplier/Model/SupplierModel');
            const suppliers = await Supplier.find({
                name: searchRegex
            }).select('_id');
            const supplierIds = suppliers.map(s => s._id);

            query.$or = [
                { paymentNumber: searchRegex },
                { referenceNumber: searchRegex },
                { supplier: { $in: supplierIds } }
            ];
        }
        
        let sort = { createdAt: -1 };
        if (sortBy) {
            sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        const total = await PaymentMade.countDocuments(query);
        const docs = await PaymentMade.find(query)
            .populate('supplier', 'name email phone')
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

exports.getPaymentMadeById = async (req, res) => {
    try {
        const doc = await PaymentMade.findById(req.params.id)
            .populate('supplier', 'name email phone');
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updatePaymentMade = async (req, res) => {
    try {
        const updatedDoc = await PaymentMade.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deletePaymentMade = async (req, res) => {
    try {
        const deletedDoc = await PaymentMade.findByIdAndDelete(req.params.id);
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

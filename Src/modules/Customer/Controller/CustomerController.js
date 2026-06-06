const Customer = require('../Model/CustomerModel');
const { getNextCustomerId } = require('../../SystemSettings/Model/CounterModel');

exports.createCustomer = async (req, res) => {
    try {
        const customerData = { ...req.body };
        if (!customerData.customerId) {
            customerData.customerId = await getNextCustomerId();
        }
        if (req.user) {
            customerData.createdBy = req.user.id || req.user._id;
            customerData.creatorRole = req.user.role;
        }

        const newDoc = new Customer(customerData);
        const savedDoc = await newDoc.save();
        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 25, search, status, branch, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = { isDeleted: false };

        if (status && status !== 'ALL') {
            query.status = status;
        }

        if (branch && branch !== 'ALL') {
            query.branch = branch;
        }

        if (search && search.trim() !== '') {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { customerId: searchRegex }
            ];
        }

        const pageInt = parseInt(page, 10);
        const limitInt = parseInt(limit, 10);
        const skip = (pageInt - 1) * limitInt;

        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const docs = await Customer.find(query)
            .populate('branch')
            .populate('driver', 'driverId status')
            .sort(sort)
            .skip(skip)
            .limit(limitInt);

        const total = await Customer.countDocuments(query);

        res.status(200).json({
            success: true,
            data: docs,
            pagination: {
                total,
                page: pageInt,
                limit: limitInt,
                totalPages: Math.ceil(total / limitInt)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getCustomerById = async (req, res) => {
    try {
        const doc = await Customer.findOne({ _id: req.params.id, isDeleted: false })
            .populate('branch')
            .populate({
                path: 'driver',
                populate: { path: 'assignedVehicle' }
            });
            
        if (!doc) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        const updatedDoc = await Customer.findOneAndUpdate(
            { _id: req.params.id, isDeleted: false },
            req.body,
            { new: true }
        ).populate('branch');

        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.downloadStatementPdf = async (req, res) => {
    try {
        const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false }).populate('branch');
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

        const { Invoice } = require('../../Invoice/Model/InvoiceModel');
        const PaymentReceived = require('../../PaymentReceived/Model/PaymentReceivedModel');
        const CreditNote = require('../../CreditNote/Model/CreditNoteModel');
        const StatementPdfService = require('../../Driver/Service/StatementPdfService');

        const [invoices, payments, creditNotes] = await Promise.all([
            Invoice.find({ customer: customer._id, isDeleted: false }),
            PaymentReceived.find({ customerId: customer._id, status: { $ne: 'VOID' } }),
            CreditNote.find({ customerId: customer._id })
        ]);

        // Build a driver-like object from customer for the shared PDF service
        const customerAsDriver = {
            personalInfo: {
                fullName: customer.name,
                email: customer.email,
                phone: customer.phone
            },
            driverId: customer.customerId,
            status: customer.status
        };

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="Customer_Statement_${customer.name.replace(/\s+/g, '_')}.pdf"`
        );

        StatementPdfService.generateStatementPdf(customerAsDriver, invoices, payments, creditNotes, res);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteCustomer = async (req, res) => {
    try {
        const deletedDoc = await Customer.findOneAndUpdate(
            { _id: req.params.id },
            { isDeleted: true },
            { new: true }
        );
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

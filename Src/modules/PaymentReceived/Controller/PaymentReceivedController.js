const PaymentReceived = require('../Model/PaymentReceivedModel');

exports.createPaymentReceived = async (req, res) => {
    try {
        const newDoc = new PaymentReceived(req.body);
        const savedDoc = await newDoc.save();
        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllPaymentReceiveds = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sortBy, sortOrder, paymentMethod } = req.query;
        console.log('PaymentReceived Query Params:', { page, limit, search, sortBy, sortOrder, paymentMethod });
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {};
        if (paymentMethod && paymentMethod !== 'ALL') {
            query.paymentMethod = paymentMethod;
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
            .populate('driverId', 'name email avatarUrl')
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
            .populate('driverId', 'name email avatarUrl');
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

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
        const docs = await PaymentReceived.find();
        res.status(200).json({ success: true, data: docs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPaymentReceivedById = async (req, res) => {
    try {
        const doc = await PaymentReceived.findById(req.params.id);
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

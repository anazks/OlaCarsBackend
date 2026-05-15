const SalesOrder = require('../Model/SalesOrderModel');

exports.createSalesOrder = async (req, res) => {
    try {
        const newDoc = new SalesOrder(req.body);
        const savedDoc = await newDoc.save();
        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllSalesOrders = async (req, res) => {
    try {
        const docs = await SalesOrder.find();
        res.status(200).json({ success: true, data: docs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getSalesOrderById = async (req, res) => {
    try {
        const doc = await SalesOrder.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateSalesOrder = async (req, res) => {
    try {
        const updatedDoc = await SalesOrder.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteSalesOrder = async (req, res) => {
    try {
        const deletedDoc = await SalesOrder.findByIdAndDelete(req.params.id);
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

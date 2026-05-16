const RecurringTransaction = require('../Model/RecurringTransactionModel');

exports.createRecurringTransaction = async (req, res) => {
    try {
        const newDoc = new RecurringTransaction(req.body);
        const savedDoc = await newDoc.save();
        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllRecurringTransactions = async (req, res) => {
    try {
        const docs = await RecurringTransaction.find();
        res.status(200).json({ success: true, data: docs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRecurringTransactionById = async (req, res) => {
    try {
        const doc = await RecurringTransaction.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateRecurringTransaction = async (req, res) => {
    try {
        const updatedDoc = await RecurringTransaction.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteRecurringTransaction = async (req, res) => {
    try {
        const deletedDoc = await RecurringTransaction.findByIdAndDelete(req.params.id);
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

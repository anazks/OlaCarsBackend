const CreditNote = require('../Model/CreditNoteModel');

exports.createCreditNote = async (req, res) => {
    try {
        const newDoc = new CreditNote(req.body);
        const savedDoc = await newDoc.save();
        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllCreditNotes = async (req, res) => {
    try {
        const docs = await CreditNote.find();
        res.status(200).json({ success: true, data: docs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getCreditNoteById = async (req, res) => {
    try {
        const doc = await CreditNote.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateCreditNote = async (req, res) => {
    try {
        const updatedDoc = await CreditNote.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteCreditNote = async (req, res) => {
    try {
        const deletedDoc = await CreditNote.findByIdAndDelete(req.params.id);
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

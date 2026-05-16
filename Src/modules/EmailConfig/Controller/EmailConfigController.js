const EmailConfigModel = require('../Model/EmailConfigModel');

exports.createEmailConfig = async (req, res) => {
    try {
        const { email, label, purpose, appPassword } = req.body;
        
        // If purpose is set, check if already exists
        if (purpose && purpose !== 'NONE') {
            const existing = await EmailConfigModel.findOne({ purpose });
            if (existing) {
                return res.status(400).json({ message: `An email is already assigned to ${purpose}` });
            }
        }

        const config = new EmailConfigModel({
            email,
            label,
            purpose,
            appPassword
        });

        await config.save();
        res.status(201).json({ message: 'Email configuration created', data: config });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllConfigs = async (req, res) => {
    try {
        const configs = await EmailConfigModel.find().sort({ createdAt: -1 });
        res.status(200).json({ data: configs });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, label, purpose, appPassword, isActive } = req.body;

        // If purpose is changing, check for uniqueness
        if (purpose && purpose !== 'NONE') {
            const existing = await EmailConfigModel.findOne({ purpose, _id: { $ne: id } });
            if (existing) {
                return res.status(400).json({ message: `An email is already assigned to ${purpose}` });
            }
        }

        const updated = await EmailConfigModel.findByIdAndUpdate(
            id,
            { email, label, purpose, appPassword, isActive },
            { new: true }
        );

        if (!updated) return res.status(404).json({ message: 'Config not found' });
        res.status(200).json({ message: 'Configuration updated', data: updated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteConfig = async (req, res) => {
    try {
        const { id } = req.params;
        await EmailConfigModel.findByIdAndDelete(id);
        res.status(200).json({ message: 'Configuration deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.assignPurpose = async (req, res) => {
    try {
        const { id } = req.params;
        const { purpose } = req.body;

        // First, unassign any existing email with this purpose
        if (purpose !== 'NONE') {
            await EmailConfigModel.updateMany({ purpose }, { purpose: 'NONE' });
        }

        const updated = await EmailConfigModel.findByIdAndUpdate(
            id,
            { purpose },
            { new: true }
        );

        res.status(200).json({ message: `Purpose assigned to ${purpose}`, data: updated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

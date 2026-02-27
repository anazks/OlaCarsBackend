const {
    addAccountingCodeService,
    getAccountingCodesService,
    getAccountingCodeByIdService,
    updateAccountingCodeService,
    deleteAccountingCodeService,
} = require("../Repo/AccountingCodeRepo");

const addAccountingCode = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;

        const newCode = await addAccountingCodeService(data);
        return res.status(201).json({ success: true, data: newCode });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getAccountingCodes = async (req, res) => {
    try {
        const query = {};
        if (req.query.category) query.category = req.query.category;
        if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

        const codes = await getAccountingCodesService(query);
        return res.status(200).json({ success: true, data: codes });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getAccountingCodeById = async (req, res) => {
    try {
        const codeElem = await getAccountingCodeByIdService(req.params.id);
        if (!codeElem) {
            return res.status(404).json({ success: false, message: "Accounting Code not found" });
        }
        return res.status(200).json({ success: true, data: codeElem });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateAccountingCode = async (req, res) => {
    try {
        const updatedCode = await updateAccountingCodeService(req.params.id, req.body);
        if (!updatedCode) {
            return res.status(404).json({ success: false, message: "Accounting Code not found" });
        }
        return res.status(200).json({ success: true, data: updatedCode });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteAccountingCode = async (req, res) => {
    try {
        const deletedCode = await deleteAccountingCodeService(req.params.id);
        if (!deletedCode) {
            return res.status(404).json({ success: false, message: "Accounting Code not found" });
        }
        return res.status(200).json({ success: true, message: "Accounting Code deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addAccountingCode,
    getAccountingCodes,
    getAccountingCodeById,
    updateAccountingCode,
    deleteAccountingCode,
};

const AccountingCodeService = require('../Service/AccountingCodeService.js');

const addAccountingCode = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newCode = await AccountingCodeService.create(data);
        return res.status(201).json({ success: true, data: newCode });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getAccountingCodes = async (req, res) => {
    try {
        const result = await AccountingCodeService.getAll(req.query);
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getAccountingCodeById = async (req, res) => {
    try {
        const code = await AccountingCodeService.getById(req.params.id);
        if (!code) return res.status(404).json({ success: false, message: 'Accounting Code not found' });
        return res.status(200).json({ success: true, data: code });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const fs = require('fs');
const updateAccountingCode = async (req, res) => {
    try {
        fs.appendFileSync('scratch/debug.txt', `[updateAccountingCode] req.body: ${JSON.stringify(req.body)}\n`);
        const updatedCode = await AccountingCodeService.update(req.params.id, req.body);
        fs.appendFileSync('scratch/debug.txt', `[updateAccountingCode] updatedCode: ${JSON.stringify(updatedCode)}\n`);
        return res.status(200).json({ success: true, data: updatedCode });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteAccountingCode = async (req, res) => {
    try {
        await AccountingCodeService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Accounting Code deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const bulkUpsertAccountingCodes = async (req, res) => {
    try {
        const { codes } = req.body;
        if (!Array.isArray(codes) || codes.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'codes' array." });
        }

        if (codes.length > 1000) {
            return res.status(400).json({ success: false, message: "Maximum 1000 codes per bulk upload." });
        }

        const createdBy = req.user.id;
        const creatorRole = req.user.role;

        const results = await AccountingCodeService.bulkUpsert(codes, createdBy, creatorRole);

        const statusCode = (results.created.length > 0 || results.updated.length > 0) ? 201 : 400;
        return res.status(statusCode).json({
            success: results.created.length > 0 || results.updated.length > 0,
            message: `${results.created.length} code(s) created, ${results.updated.length} code(s) updated, ${results.errors.length} error(s).`,
            data: results
        });
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
    bulkUpsertAccountingCodes,
};

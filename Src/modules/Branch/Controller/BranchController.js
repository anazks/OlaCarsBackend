const BranchService = require('../Service/BranchService.js');

const addBranch = async (req, res) => {
    try {
        const branchData = { ...req.body };
        branchData.createdBy = req.user.id;
        branchData.creatorRole = req.user.role;
        const newBranch = await BranchService.create(branchData);
        return res.status(201).json({ success: true, data: newBranch });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getBranches = async (req, res) => {
    try {
        const branches = await BranchService.getAll();
        return res.status(200).json({ success: true, data: branches });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getBranchById = async (req, res) => {
    try {
        const branch = await BranchService.getById(req.params.id);
        if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
        return res.status(200).json({ success: true, data: branch });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editBranch = async (req, res) => {
    try {
        const updatedBranch = await BranchService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedBranch });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteBranch = async (req, res) => {
    try {
        await BranchService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Branch deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    addBranch,
    editBranch,
    deleteBranch,
    getBranches,
    getBranchById
};
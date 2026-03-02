const { addBranchService, deleteBranchService, editBranchService, getBranchesService, getBranchByIdService } = require('../Repo/BranchRepo.js');

/**
 * Handles creation of a new branch.
 * @route POST /api/branches/branch
 * @access Private
 */
const addBranch = async (req, res) => {
    try {
        console.log("addBranch called with body:", req.body); // Debug log  
        let branchData = req.body;
        console.log("Received branch data:", branchData); // Debug log
        branchData.createdBy = req.user.id;
        branchData.creatorRole = req.user.role;
        const newBranch = await addBranchService(branchData);
        return res.status(201).json({
            success: true,
            data: newBranch
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}

/**
 * Handles fetching all branches.
 * @route GET /api/branch
 * @access Private
 */
const getBranches = async (req, res) => {
    try {
        const branches = await getBranchesService();
        return res.status(200).json({
            success: true,
            data: branches
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

/**
 * Handles fetching a branch by ID.
 * @route GET /api/branch/:id
 * @access Private
 */
const getBranchById = async (req, res) => {
    try {
        const branchId = req.params.id;
        const branch = await getBranchByIdService(branchId);
        if (!branch) {
            return res.status(404).json({ success: false, message: "Branch not found" });
        }
        return res.status(200).json({
            success: true,
            data: branch
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

/**
 * Handles updating of a branch.
 * @route PUT /api/Updatebranch
 * @access Private
 */
const editBranch = async (req, res) => {
    try {
        const branchData = req.body;
        console.log("editBranch called with body:", req.body); // Debug log
        branchData.createdBy = req.user.id;
        branchData.creatorRole = req.user.role;
        const updatedBranch = await editBranchService(branchData);
        return res.status(200).json({
            success: true,
            data: updatedBranch
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
/**
 * Handles soft deletion of a branch.
 * @route DELETE /api/branch/:id
 * @access Private
 */
const deleteBranch = async (req, res) => {
    try {
        const branchId = req.params.id;
        console.log("deleteBranch called with id:", branchId); // Debug log
        await deleteBranchService(branchId);
        return res.status(200).json({
            success: true,
            message: "Branch deleted successfully"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
module.exports = {
    addBranch,
    editBranch,
    deleteBranch,
    getBranches,
    getBranchById
}
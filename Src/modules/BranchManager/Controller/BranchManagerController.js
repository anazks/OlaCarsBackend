const {
    addBranchManagerService,
    editBranchManagerService,
    deleteBranchManagerService,
    getBranchManagersService,
    getBranchManagerByIdService,
    loginBranchManager
} = require('../Repo/BranchManagerRepo.js');

/**
 * Handles BranchManager login.
 * @route POST /api/branchmanager/login
 * @access Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await loginBranchManager(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
};

/**
 * Creates a new Branch Manager.
 * @route POST /api/branchmanager/
 * @access Private
 */
const addBranchManager = async (req, res) => {
    try {
        let branchManagerData = req.body;
        // Inject the creator's role and ID from the JWT token attached to req.user
        branchManagerData.createdBy = req.user.id;
        branchManagerData.creatorRole = req.user.role;

        const newBranchManager = await addBranchManagerService(branchManagerData);
        return res.status(201).json({
            success: true,
            data: newBranchManager
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets all Branch Managers.
 * @route GET /api/branchmanager/
 * @access Private
 */
const getBranchManagers = async (req, res) => {
    try {
        const managers = await getBranchManagersService();
        return res.status(200).json({ success: true, data: managers });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a Branch Manager by ID.
 * @route GET /api/branchmanager/:id
 * @access Private
 */
const getBranchManagerById = async (req, res) => {
    try {
        const manager = await getBranchManagerByIdService(req.params.id);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Branch Manager not found" });
        }
        return res.status(200).json({ success: true, data: manager });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates a Branch Manager.
 * @route PUT /api/branchmanager/update
 * @access Private
 */
const editBranchManager = async (req, res) => {
    try {
        const updatedManager = await editBranchManagerService(req.body);
        return res.status(200).json({ success: true, data: updatedManager });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Deletes a Branch Manager.
 * @route DELETE /api/branchmanager/:id
 * @access Private
 */
const deleteBranchManager = async (req, res) => {
    try {
        await deleteBranchManagerService(req.params.id);
        return res.status(200).json({ success: true, message: "Branch Manager deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addBranchManager,
    editBranchManager,
    deleteBranchManager,
    getBranchManagers,
    getBranchManagerById,
    login
};

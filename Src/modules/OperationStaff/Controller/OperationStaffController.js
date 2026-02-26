const {
    addOperationStaffService,
    editOperationStaffService,
    deleteOperationStaffService,
    getOperationStaffService,
    getOperationStaffByIdService,
    loginOperationStaff
} = require('../Repo/OperationStaffRepo.js');

/**
 * Handles Operation Staff login.
 * @route POST /api/operationstaff/login
 * @access Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await loginOperationStaff(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
};

/**
 * Adds an Operation Staff member.
 * @route POST /api/operationstaff/
 * @access Private
 */
const addOperationStaff = async (req, res) => {
    try {
        let staffData = req.body;
        staffData.createdBy = req.user.id;
        staffData.creatorRole = req.user.role;

        const newStaff = await addOperationStaffService(staffData);
        return res.status(201).json({ success: true, data: newStaff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets all Operation Staff members.
 * @route GET /api/operationstaff/
 * @access Private
 */
const getOperationStaff = async (req, res) => {
    try {
        const staff = await getOperationStaffService();
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a specific Operation Staff member by ID.
 * @route GET /api/operationstaff/:id
 * @access Private
 */
const getOperationStaffById = async (req, res) => {
    try {
        const staff = await getOperationStaffByIdService(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates an Operation Staff member.
 * @route PUT /api/operationstaff/update
 * @access Private
 */
const editOperationStaff = async (req, res) => {
    try {
        const updatedStaff = await editOperationStaffService(req.body);
        return res.status(200).json({ success: true, data: updatedStaff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Deletes an Operation Staff member.
 * @route DELETE /api/operationstaff/:id
 * @access Private
 */
const deleteOperationStaff = async (req, res) => {
    try {
        await deleteOperationStaffService(req.params.id);
        return res.status(200).json({ success: true, message: "Staff deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addOperationStaff,
    editOperationStaff,
    deleteOperationStaff,
    getOperationStaff,
    getOperationStaffById,
    login
};

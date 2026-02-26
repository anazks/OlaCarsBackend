const {
    addFinanceStaffService,
    editFinanceStaffService,
    deleteFinanceStaffService,
    getFinanceStaffService,
    getFinanceStaffByIdService,
    loginFinanceStaff
} = require('../Repo/FinanceStaffRepo.js');

/**
 * Handles Finance Staff login.
 * @route POST /api/financestaff/login
 * @access Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await loginFinanceStaff(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
};

/**
 * Adds a Finance Staff member.
 * @route POST /api/financestaff/
 * @access Private
 */
const addFinanceStaff = async (req, res) => {
    try {
        let staffData = req.body;
        staffData.createdBy = req.user.id;
        staffData.creatorRole = req.user.role;

        const newStaff = await addFinanceStaffService(staffData);
        return res.status(201).json({ success: true, data: newStaff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets all Finance Staff members.
 * @route GET /api/financestaff/
 * @access Private
 */
const getFinanceStaff = async (req, res) => {
    try {
        const staff = await getFinanceStaffService();
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a Finance Staff member by ID.
 * @route GET /api/financestaff/:id
 * @access Private
 */
const getFinanceStaffById = async (req, res) => {
    try {
        const staff = await getFinanceStaffByIdService(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates a Finance Staff member.
 * @route PUT /api/financestaff/update
 * @access Private
 */
const editFinanceStaff = async (req, res) => {
    try {
        const updatedStaff = await editFinanceStaffService(req.body);
        return res.status(200).json({ success: true, data: updatedStaff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Deletes a Finance Staff member.
 * @route DELETE /api/financestaff/:id
 * @access Private
 */
const deleteFinanceStaff = async (req, res) => {
    try {
        await deleteFinanceStaffService(req.params.id);
        return res.status(200).json({ success: true, message: "Staff deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addFinanceStaff,
    editFinanceStaff,
    deleteFinanceStaff,
    getFinanceStaff,
    getFinanceStaffById,
    login
};

const {
    addWorkshopStaffService,
    editWorkshopStaffService,
    deleteWorkshopStaffService,
    getWorkshopStaffService,
    getWorkshopStaffByIdService,
    loginWorkshopStaff
} = require('../Repo/WorkshopStaffRepo.js');

/**
 * Handles Workshop Staff login.
 * @route POST /api/workshopstaff/login
 * @access Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await loginWorkshopStaff(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
};

/**
 * Adds a Workshop Staff member.
 * @route POST /api/workshopstaff/
 * @access Private
 */
const addWorkshopStaff = async (req, res) => {
    try {
        let staffData = req.body;
        staffData.createdBy = req.user.id;
        staffData.creatorRole = req.user.role;

        const newStaff = await addWorkshopStaffService(staffData);
        return res.status(201).json({ success: true, data: newStaff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets all Workshop Staff members.
 * @route GET /api/workshopstaff/
 * @access Private
 */
const getWorkshopStaff = async (req, res) => {
    try {
        const staff = await getWorkshopStaffService();
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a Workshop Staff member by ID.
 * @route GET /api/workshopstaff/:id
 * @access Private
 */
const getWorkshopStaffById = async (req, res) => {
    try {
        const staff = await getWorkshopStaffByIdService(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates a Workshop Staff member.
 * @route PUT /api/workshopstaff/update
 * @access Private
 */
const editWorkshopStaff = async (req, res) => {
    try {
        const updatedStaff = await editWorkshopStaffService(req.body);
        return res.status(200).json({ success: true, data: updatedStaff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Deletes a Workshop Staff member.
 * @route DELETE /api/workshopstaff/:id
 * @access Private
 */
const deleteWorkshopStaff = async (req, res) => {
    try {
        await deleteWorkshopStaffService(req.params.id);
        return res.status(200).json({ success: true, message: "Staff deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addWorkshopStaff,
    editWorkshopStaff,
    deleteWorkshopStaff,
    getWorkshopStaff,
    getWorkshopStaffById,
    login
};

const {
    addCountryManagerService,
    editCountryManagerService,
    deleteCountryManagerService,
    getCountryManagersService,
    getCountryManagerByIdService,
    loginCountryManager,
    refreshAccessToken
} = require('../Repo/CountryManagerRepo.js');

/**
 * Creates a new Country Manager.
 * @route POST /api/country-manager
 * @access Private (Admin/SuperAdmin)
 */
const addCountryManager = async (req, res) => {
    try {
        const data = req.body;

        // Inject creator tracking info from the authenticated user
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;

        const newManager = await addCountryManagerService(data);
        return res.status(201).json({
            success: true,
            data: newManager
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Updates an existing Country Manager.
 * @route PUT /api/country-manager/update
 * @access Private (Admin/SuperAdmin)
 */
const editCountryManager = async (req, res) => {
    try {
        const data = req.body;
        const updatedManager = await editCountryManagerService(data);
        return res.status(200).json({
            success: true,
            data: updatedManager
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Deletes a Country Manager by ID (soft delete).
 * @route DELETE /api/country-manager/:id
 * @access Private (Admin/SuperAdmin)
 */
const deleteCountryManager = async (req, res) => {
    try {
        const managerId = req.params.id;
        await deleteCountryManagerService(managerId);
        return res.status(200).json({
            success: true,
            message: "Country Manager deleted successfully"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Retrieves all Country Managers.
 * @route GET /api/country-manager
 * @access Private (Admin/SuperAdmin)
 */
const getCountryManagers = async (req, res) => {
    try {
        console.log("getCountryManagers");
        const managers = await getCountryManagersService();
        return res.status(200).json({
            success: true,
            data: managers
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Retrieves a Country Manager by ID.
 * @route GET /api/country-manager/:id
 * @access Private (Admin/SuperAdmin)
 */
const getCountryManagerById = async (req, res) => {
    try {
        const managerId = req.params.id;
        const manager = await getCountryManagerByIdService(managerId);
        if (!manager) {
            return res.status(404).json({
                success: false,
                message: "Country Manager not found"
            });
        }
        return res.status(200).json({
            success: true,
            data: manager
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Handles Country Manager login request.
 * @route POST /api/country-manager/login
 * @access Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const tokens = await loginCountryManager(email, password);

        return res.status(200).json({
            success: true,
            ...tokens,
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Handles Country Manager token refresh request.
 * @route POST /api/country-manager/refresh
 * @access Public
 */
const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;

        const newToken = await refreshAccessToken(token);

        return res.json(newToken);
    } catch (error) {
        return res.status(403).json({
            message: "Invalid refresh token",
        });
    }
};

module.exports = {
    login,
    refreshToken,
    addCountryManager,
    editCountryManager,
    deleteCountryManager,
    getCountryManagers,
    getCountryManagerById
};

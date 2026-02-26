const {
    addUserService,
    editUserService,
    deleteUserService,
    getUsersService,
    getUserByIdService,
    loginUser
} = require('../Repo/UserRepo.js');

/**
 * Handles User login request.
 * @route POST /api/user/login
 * @access Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await loginUser(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
};

/**
 * Handles User registration request.
 * @route POST /api/user/register
 * @access Public
 */
const addUser = async (req, res) => {
    try {
        let userData = req.body;
        userData.createdBy = req.user.id;
        userData.creatorRole = req.user.role;

        const newUser = await addUserService(userData);
        return res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Fetches all registered Users.
 * @route GET /api/user/
 * @access Private
 */
const getUsers = async (req, res) => {
    try {
        const users = await getUsersService();
        return res.status(200).json({ success: true, data: users });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Fetches User by ID.
 * @route GET /api/user/:id
 * @access Private
 */
const getUserById = async (req, res) => {
    try {
        const user = await getUserByIdService(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        return res.status(200).json({ success: true, data: user });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates a User.
 * @route PUT /api/user/update
 * @access Private
 */
const editUser = async (req, res) => {
    try {
        const updatedUser = await editUserService(req.body);
        return res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Deletes a User.
 * @route DELETE /api/user/:id
 * @access Private
 */
const deleteUser = async (req, res) => {
    try {
        await deleteUserService(req.params.id);
        return res.status(200).json({ success: true, message: "User deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addUser,
    editUser,
    deleteUser,
    getUsers,
    getUserById,
    login
};

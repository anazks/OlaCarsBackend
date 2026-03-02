const UserService = require('../Service/UserService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await UserService.login(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const addUser = async (req, res) => {
    try {
        const userData = { ...req.body };
        userData.createdBy = req.user.id;
        userData.creatorRole = req.user.role;
        const newUser = await UserService.create(userData);
        return res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = await UserService.getAll();
        return res.status(200).json({ success: true, data: users });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await UserService.getById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.status(200).json({ success: true, data: user });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editUser = async (req, res) => {
    try {
        const updatedUser = await UserService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await UserService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        await UserService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    addUser,
    editUser,
    changePassword,
    deleteUser,
    getUsers,
    getUserById,
    login
};

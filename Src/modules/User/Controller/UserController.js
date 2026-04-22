const UserService = require('../Service/UserService.js');
const AdminService = require('../../Admin/Service/AdminService.js');
const BranchManagerService = require('../../BranchManager/Service/BranchManagerService.js');
const CountryManagerService = require('../../CountryManager/Service/CountryManagerService.js');
const OperationAdminService = require('../../OperationAdmin/Service/OperationAdminService.js');
const FinanceAdminService = require('../../FinanceAdmin/Service/FinanceAdminService.js');
const OperationStaffService = require('../../OperationStaff/Service/OperationStaffService.js');
const FinanceStaffService = require('../../FinanceStaff/Service/FinanceStaffService.js');
const WorkshopManagerService = require('../../WorkshopManager/Service/WorkshopManagerService.js');
const WorkshopStaffService = require('../../WorkshopStaff/Service/WorkshopStaffService.js');

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

const getProfile = async (req, res) => {
    try {
        const { id, role } = req.user;
        let userData = null;

        switch (role) {
            case 'ADMIN':
                userData = await AdminService.getById(id);
                break;
            case 'BRANCHMANAGER':
                userData = await BranchManagerService.getById(id);
                break;
            case 'COUNTRYMANAGER':
                userData = await CountryManagerService.getById(id);
                break;
            case 'OPERATIONADMIN':
                userData = await OperationAdminService.getById(id);
                break;
            case 'FINANCEADMIN':
                userData = await FinanceAdminService.getById(id);
                break;
            case 'OPERATIONSTAFF':
                userData = await OperationStaffService.getById(id);
                break;
            case 'FINANCESTAFF':
                userData = await FinanceStaffService.getById(id);
                break;
            case 'WORKSHOPMANAGER':
                userData = await WorkshopManagerService.getById(id);
                break;
            case 'WORKSHOPSTAFF':
                // I need to confirm the Workshop Staff service name
                const WorkshopStaffService = require('../../WorkshopStaff/Service/WorkshopStaffService.js');
                userData = await WorkshopStaffService.getById(id);
                break;
            case 'USER':
                userData = await UserService.getById(id);
                break;
            default:
                throw new Error('Invalid role');
        }

        if (!userData) return res.status(404).json({ success: false, message: 'User profile not found' });
        
        return res.status(200).json({ success: true, user: userData });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
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
    getProfile,
    login
};

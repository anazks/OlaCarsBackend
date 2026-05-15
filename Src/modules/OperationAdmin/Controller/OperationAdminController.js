const OperationAdminService = require('../Service/OperationAdminService.js');
const DashboardService = require('../../Dashboard/Service/DashboardService.js');
const targetService = require('../../StaffPerformance/Service/targetService.js');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const tokens = await OperationAdminService.login(email, password);
    return res.status(200).json({ success: true, ...tokens });
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    await OperationAdminService.logout(req.user.id);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const newToken = await OperationAdminService.refreshAccessToken(refreshToken);
    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({ message: 'Invalid refresh token' });
  }
};

const addOperationalAdmin = async (req, res) => {
  try {
    const adminData = { ...req.body };
    adminData.createdBy = req.user.id;
    adminData.creatorRole = req.user.role;
    const newAdmin = await OperationAdminService.create(adminData);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const getOperationalAdmins = async (req, res) => {
  try {
    const result = await OperationAdminService.getAll(req.query);
    return res.status(200).json({ 
      success: true, 
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getOperationalAdminById = async (req, res) => {
  try {
    const admin = await OperationAdminService.getById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Operational Admin not found' });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const editOperationalAdmin = async (req, res) => {
  try {
    const payload = { ...req.body, modifierId: req.user.id, modifierRole: req.user.role };
    const updatedAdmin = await OperationAdminService.update(req.params.id, payload);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await OperationAdminService.changePassword(req.params.id, currentPassword, newPassword);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const deleteOperationalAdmin = async (req, res) => {
  try {
    await OperationAdminService.remove(req.params.id);
    return res.status(200).json({ success: true, message: 'Operational Admin deleted successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const filters = {
      country: req.query.country || req.user.country,
      branch: req.query.branchId || req.user.branchId
    };

    const [summary, tasks] = await Promise.all([
      DashboardService.getSummaryStats(filters),
      targetService.getDashboardTaskStats(req.user)
    ]);

    // Format fleet status for Recharts
    const fleetStatus = [
      { name: 'Available', value: summary.fleetStatus.available, color: '#3B82F6' },
      { name: 'Rented', value: summary.fleetStatus.rented, color: '#148F85' },
      { name: 'Maintenance', value: summary.fleetStatus.maintenance, color: '#F59E0B' },
      { name: 'Other', value: summary.fleetStatus.other + summary.fleetStatus.retired, color: '#6B7280' }
    ];

    const fleetUtilization = summary.stats.totalActiveVehicles > 0 
      ? Math.round((summary.fleetStatus.rented / summary.stats.totalActiveVehicles) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        vehicleKpis: {
          totalVehicles: summary.totalVehicles || 0,
          availableVehicles: summary.fleetStatus.available || 0,
          activeVehicles: summary.fleetStatus.rented || 0,
          maintenanceVehicles: summary.fleetStatus.maintenance || 0
        },
        driverKpis: {
          activeDrivers: summary.stats.activeDrivers || 0
        },
        alertsSummary: {
          critical: summary.alerts.CRITICAL || 0,
          major: summary.alerts.MAJOR || 0,
          minor: summary.alerts.MINOR || 0
        },
        tasks,
        fleetStatus,
        fleetUtilization
      }
    });
  } catch (error) {
    console.error("Operation Dashboard Stats Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  logout,
  refreshToken,
  addOperationalAdmin,
  getOperationalAdmins,
  getOperationalAdminById,
  editOperationalAdmin,
  changePassword,
  deleteOperationalAdmin,
  getDashboardStats
};

const AppError = require("../utils/AppError");
const RoleTemplate = require("../../modules/AccessControl/Model/RoleTemplate");


/**
 * Middleware to check if the authenticated user has a specific permission.
 * Assumes the user object is already populated on req by authMiddleware.
 * 
 * @param {string|string[]} requiredPermissions - The permission(s) required to access the route.
 * @returns {Function} Express middleware function
 */
const hasPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required.", 401);
      }

      // If no permissions required, allow access
      if (!requiredPermissions || requiredPermissions.length === 0) {
        return next();
      }

      // Always allow ADMIN (Super Admin)
      if (req.user.role === "ADMIN") {
        return next();
      }

      // We need to fetch the fresh user to get their current permissions array.
      // Since we have multiple models, we need a dynamic way to find the user.
      const userId = req.user.id;
      const userRole = req.user.role;
      let Model;

      switch (userRole) {
        case "OPERATIONADMIN":
          Model = require("../../modules/OperationAdmin/model/OperationAdminModel");
          break;
        case "FINANCEADMIN":
          Model = require("../../modules/FinanceAdmin/model/FinanceAdminModel");
          break;
        case "COUNTRYMANAGER":
          Model = require("../../modules/CountryManager/Model/CountryManagerModel");
          break;
        case "BRANCHMANAGER":
          Model = require("../../modules/BranchManager/Model/BranchManagerModel");
          break;
        case "OPERATIONSTAFF":
          Model = require("../../modules/OperationStaff/Model/OperationStaffModel");
          break;
        case "FINANCESTAFF":
          Model = require("../../modules/FinanceStaff/Model/FinanceStaffModel");
          break;
        case "WORKSHOPMANAGER":
          Model = require("../../modules/WorkshopManager/Model/WorkshopManagerModel");
          break;
        case "WORKSHOPSTAFF":
          Model = require("../../modules/WorkshopStaff/Model/WorkshopStaffModel");
          break;
        case "USER":
          Model = require("../../modules/Driver/Model/DriverModel").Driver;
          break;
        default:
          throw new AppError("Invalid user role.", 403);
      }

      const currentUser = await Model.findById(userId).select("permissions status isDeleted");

      if (!currentUser || currentUser.isDeleted || currentUser.status !== "ACTIVE") {
        throw new AppError("Account not active or found.", 403);
      }

      const userPermissions = currentUser.permissions || [];

      // Fetch permissions from role template
      const roleTemplate = await RoleTemplate.findOne({ roleName: userRole });
      const rolePermissions = roleTemplate ? roleTemplate.permissions : [];

      // Combine user-specific and role-based permissions
      const combinedPermissions = [...new Set([...userPermissions, ...rolePermissions])];

      // Normalize required permissions to an array
      const requiredArr = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      // Check if user has ALL required permissions
      const hasAccess = requiredArr.every((perm) => combinedPermissions.includes(perm));

      if (!hasAccess) {
        throw new AppError(
          "Access denied. You do not have the required permissions for this action.",
          403
        );
      }

      // Attach merged permissions to request for downstream use if needed
      req.user.permissions = combinedPermissions;
      next();
    } catch (error) {
      console.log(`[Permission DEBUG] Error: ${error.message}, Status: ${error.statusCode}`);
      next(error);
    }
  };
};

module.exports = { hasPermission };

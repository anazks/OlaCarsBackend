const AppError = require("../utils/AppError");

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
          Model = require("../../modules/OperationAdmin/Model/OperationAdminModel");
          break;
        case "FINANCEADMIN":
          Model = require("../../modules/FinanceAdmin/Model/FinanceAdminModel");
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
          Model = require("../../modules/User/Model/UserModel");
          break;
        default:
          throw new AppError("Invalid user role.", 403);
      }

      const currentUser = await Model.findById(userId).select("permissions status isDeleted");

      if (!currentUser || currentUser.isDeleted || currentUser.status !== "ACTIVE") {
        throw new AppError("Account not active or found.", 403);
      }

      const userPermissions = currentUser.permissions || [];

      // Normalize required permissions to an array
      const requiredArr = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      // Check if user has ALL required permissions (can modify to SOME if needed)
      const hasAccess = requiredArr.every((perm) => userPermissions.includes(perm));

      if (!hasAccess) {
        throw new AppError(
          "Access denied. You do not have the required permissions for this action.",
          403
        );
      }

      // Attach fresh permissions to request for downstream use if needed
      req.user.permissions = userPermissions;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { hasPermission };

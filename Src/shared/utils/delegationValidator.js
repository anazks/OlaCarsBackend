const AppError = require('./AppError');

/**
 * Validates that a user granting permissions actually possesses those permissions themselves.
 * 
 * @param {string} delegatorId - ID of the user granting permissions.
 * @param {string} delegatorRole - Role of the user granting permissions.
 * @param {string[]} requestedPermissions - The array of permissions being granted.
 * @returns {Promise<boolean>}
 */
const validateDelegatedPermissions = async (delegatorId, delegatorRole, requestedPermissions) => {
    if (!requestedPermissions || requestedPermissions.length === 0) return true;
    
    // ADMIN bypass - Admin has all permissions intrinsically
    if (delegatorRole === 'ADMIN') return true; 

    // Find the appropriate model dynamically
    let DelegatorModel;
    switch (delegatorRole) {
        case 'OPERATIONADMIN': 
            DelegatorModel = require('../../modules/OperationAdmin/Model/OperationAdminModel'); break;
        case 'FINANCEADMIN': 
            DelegatorModel = require('../../modules/FinanceAdmin/Model/FinanceAdminModel'); break;
        case 'COUNTRYMANAGER': 
            DelegatorModel = require('../../modules/CountryManager/Model/CountryManagerModel'); break;
        case 'BRANCHMANAGER': 
            DelegatorModel = require('../../modules/BranchManager/Model/BranchManagerModel'); break;
        case 'WORKSHOPMANAGER': 
            DelegatorModel = require('../../modules/WorkshopManager/Model/WorkshopManagerModel'); break;
        default: 
            throw new AppError('Creator/Modifier role not authorized to delegate permissions', 403);
    }
    
    const delegator = await DelegatorModel.findById(delegatorId).select('permissions');
    if (!delegator) throw new AppError('Creator/Modifier not found', 404);
    
    const delegatorPerms = delegator.permissions || [];
    
    const hasAll = requestedPermissions.every(p => delegatorPerms.includes(p));
    
    if (!hasAll) throw new AppError('Permission Delegation Denied. You cannot grant permissions you do not possess.', 403);
    
    return true;
};

module.exports = validateDelegatedPermissions;

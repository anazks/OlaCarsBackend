
const Branch = require("../Model/BranchModel.js");
/**
 * Creates a new branch in the database.
 * @param {Object} branchData - The payload containing branch details.
 * @param {string} branchData.name - The name of the branch.
 * @param {string} branchData.code - Branch code.
 * @param {string} branchData.address - Branch address.
 * @param {string} branchData.city - City of the branch.
 * @param {string} branchData.state - State of the branch.
 * @param {string} branchData.phone - Contact phone number.
 * @returns {Promise<Object>} The newly created Branch document.
 */
exports.addBranchService = async (branchData) => {
    try {
        // Simulate adding branch to the database
        const newBranch = await Branch.create(branchData);
        return newBranch;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates an existing branch in the database.
 * @param {Object} branchData - The payload containing updated branch fields including the branch `id`.
 * @returns {Promise<Object>} The updated Branch document.
 */
exports.editBranchService = async (branchData) => {
    try {
        const { id, ...updateData } = branchData;
        const updatedBranch = await Branch.findByIdAndUpdate(id, updateData, { new: true });
        return updatedBranch;
    } catch (error) {
        throw error;
    }
}

/**
 * Soft deletes a branch by marking it as deleted.
 * @param {string} branchId - The ID of the branch to delete.
 * @returns {Promise<void>}
 */
exports.deleteBranchService = async (branchId) => {
    try {
        await Branch.findByIdAndUpdate(branchId, { isDeleted: true });
    } catch (error) {
        throw error;
    }
}

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");
require("../../BranchManager/Model/BranchManagerModel.js");

/**
 * Retrieves all branches using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getBranchesService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["name", "code", "city", "state"],
            filterFields: ["status", "country"],
            dateFilterField: "createdAt",
            populate: [
                { path: "countryManager", select: "fullName country" },
                { path: "branchManager" }
            ],
            ...options
        };

        const result = await applyQueryFeatures(Branch, queryParams, queryOptions);
        console.log(`[DEBUG] getBranchesService returning ${result.data.length} branches. First branch manager:`, result.data[0]?.branchManager);
        return result;
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single branch by ID.
 * @param {string} branchId - The ID of the branch.
 * @returns {Promise<Object>} The branch document.
 */
exports.getBranchByIdService = async (branchId) => {
    try {
        const branch = await Branch.findById(branchId).populate([
            { path: "countryManager", select: "fullName country" },
            { path: "branchManager" }
        ]);
        if (!branch) return null;

        // const roleMapping = {
        //     'ADMIN': 'Admin',
        //     'OPERATIONADMIN': 'OperationalAdmin',
        //     'FINANCEADMIN': 'FinanceAdmin',
        //     'COUNTRYMANAGER': 'CountryManager'
        // };

        // const modelName = roleMapping[branch.creatorRole];
        // if (modelName) {
        //     await branch.populate({
        //         path: 'createdBy',
        //         model: modelName,
        //         select: 'name fullName email role'
        //     });
        // }

        return branch;
    } catch (error) {
        throw error;
    }
}


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

/**
 * Retrieves all branches.
 * @param {Object} query - Optional query filters
 * @returns {Promise<Array>} List of branches
 */
exports.getBranchesService = async () => {
    try {
        const branches = await Branch.find();
        const roleMapping = {
            'ADMIN': 'Admin',
            'OPERATIONADMIN': 'OperationalAdmin',
            'FINANCEADMIN': 'FinanceAdmin',
            'COUNTRYMANAGER': 'CountryManager'
        };

        // Populate manually by grouping by model
        const populatedBranches = await Promise.all(branches.map(async (branch) => {
            const modelName = roleMapping[branch.creatorRole];
            if (modelName) {
                await branch.populate({
                    path: 'createdBy',
                    model: modelName,
                    select: 'name fullName email role'
                });
            }
            return branch;
        }));

        return populatedBranches;
        // return branches;
    } catch (error) {
        throw error;
    }
}

/**
 * Retrieves a single branch by ID.
 * @param {string} branchId - The ID of the branch.
 * @returns {Promise<Object>} The branch document.
 */
exports.getBranchByIdService = async (branchId) => {
    try {
        const branch = await Branch.findById(branchId);
        if (!branch) return null;

        const roleMapping = {
            'ADMIN': 'Admin',
            'OPERATIONADMIN': 'OperationalAdmin',
            'FINANCEADMIN': 'FinanceAdmin',
            'COUNTRYMANAGER': 'CountryManager'
        };

        const modelName = roleMapping[branch.creatorRole];
        if (modelName) {
            await branch.populate({
                path: 'createdBy',
                model: modelName,
                select: 'name fullName email role'
            });
        }

        return branch;
    } catch (error) {
        throw error;
    }
}

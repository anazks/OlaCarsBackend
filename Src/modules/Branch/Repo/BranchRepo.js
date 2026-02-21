
import Branch from "../Model/BranchModel.js";
export const addBranchService = async (branchData) => {
    try {
        // Simulate adding branch to the database
        const newBranch = await Branch.create(branchData);
        return newBranch;
    } catch (error) {
        throw error;
    }
}


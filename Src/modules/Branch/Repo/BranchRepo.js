
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

export const editBranchService = async (branchData) => {
    try {
        const { id, ...updateData } = branchData;
        const updatedBranch = await Branch.findByIdAndUpdate(id, updateData, { new: true });
        return updatedBranch;
    } catch (error) {
        throw error;
    }
}

export const deleteBranchService = async (branchId) => {
    try {
        await Branch.findByIdAndUpdate(branchId, { isDeleted: true });
    } catch (error) {
        throw error;
    }
}


const { addBranchService,deleteBranchService,editBranchService } = require('../Repo/BranchRepo.js');

const addBranch = async (req, res) => {
        try {   
            console.log("addBranch called with body:", req.body); // Debug log  
            let branchData = req.body;
            console.log("Received branch data:", branchData); // Debug log
            const newBranch = await addBranchService(branchData);
            return res.status(201).json({
                success: true,
                data: newBranch
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            })
        }
}
const editBranch = async (req, res) => {
    try {
        const branchData = req.body;
        console.log("editBranch called with body:", req.body); // Debug log
        const updatedBranch = await editBranchService(branchData);
        return res.status(200).json({
            success: true,
            data: updatedBranch
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
const deleteBranch = async (req, res) => {
    try {
        const branchId = req.params.id;
        console.log("deleteBranch called with id:", branchId); // Debug log
        await deleteBranchService(branchId);
        return res.status(200).json({
            success: true,
            message: "Branch deleted successfully"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
module.exports = {
    addBranch,
    editBranch,
    deleteBranch
}
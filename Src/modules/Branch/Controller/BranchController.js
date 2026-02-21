const { addBranchService } = require('../Repo/BranchRepo.js');

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

module.exports = {
    addBranch
}
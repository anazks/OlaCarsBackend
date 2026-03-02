const mongoose = require('mongoose');

async function checkModels() {
    try {
        await mongoose.connect('mongodb+srv://user:123@cluster0.h9lmv8j.mongodb.net/olaCars?appName=Cluster0');

        // Explicitly load models in the correct order
        require('./Src/modules/Admin/model/adminModel.js');
        require('./Src/modules/OperationAdmin/model/OperationAdminModel.js');
        require('./Src/modules/FinanceAdmin/model/FinanceAdminModel.js');
        require('./Src/modules/CountryManager/Model/CountryManagerModel.js');
        const Branch = require('./Src/modules/Branch/Model/BranchModel.js');

        console.log("Registered models:");
        console.log(Object.keys(mongoose.models));

        const branches = await Branch.find().populate("createdBy", "name email role");
        console.log("SUCCESS. Loaded:", branches.length);
    } catch (e) {
        console.error("FAIL:", e.message);
    } finally {
        process.exit(0);
    }
}
checkModels();

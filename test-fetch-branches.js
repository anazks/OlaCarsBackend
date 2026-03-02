const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect('mongodb+srv://user:123@cluster0.h9lmv8j.mongodb.net/olaCars?appName=Cluster0');

        // We need to require the models so Mongoose registers them
        require('./Src/modules/Admin/model/adminModel.js');
        require('./Src/modules/OperationAdmin/model/OperationAdminModel.js');
        require('./Src/modules/FinanceAdmin/model/FinanceAdminModel.js');
        require('./Src/modules/CountryManager/Model/CountryManagerModel.js');
        const Branch = require('./Src/modules/Branch/Model/BranchModel.js');

        const branches = await Branch.find({}).populate("createdBy");
        console.log("Branches loaded successfully:", branches.length);
        console.log(JSON.stringify(branches[0], null, 2));

    } catch (err) {
        console.error("Test Error:", err.message);
    } finally {
        mongoose.disconnect();
    }
}

test();

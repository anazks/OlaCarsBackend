const mongoose = require('mongoose');

async function testLoading() {
    try {
        await mongoose.connect('mongodb+srv://user:123@cluster0.h9lmv8j.mongodb.net/olaCars?appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // Exact sequence from app.js router loading
        require('./Src/modules/Admin/Routes/AdminRoutes');
        require('./Src/modules/Branch/Routes/BranchRouter');
        require('./Src/modules/CountryManager/Routes/CountryManagerRouter');
        require('./Src/modules/FinanceAdmin/Routes/FinanceAdminRoutes');
        require('./Src/modules/OperationAdmin/Routes/OperationAdminRoutes');
        require('./Src/modules/BranchManager/Routes/BranchManagerRouter');

        const Branch = require('./Src/modules/Branch/Model/BranchModel');

        console.log("----- REGISTERED MODELS -----");
        console.log(Object.keys(mongoose.models));

        const branches = await Branch.find().populate("createdBy", "name email role");
        console.log("\nPopulate successful! Loaded", branches.length);
    } catch (error) {
        console.error("Test Error:", error);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
}

testLoading();

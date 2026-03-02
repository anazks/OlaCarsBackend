const mongoose = require('mongoose');

const mongooseOptions = { strict: false };
const adminSchema = new mongoose.Schema({ name: String }, mongooseOptions);
const Admin = mongoose.model('Admin', adminSchema);

const branchSchema = new mongoose.Schema({
    name: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'creatorModelName'
    },
    creatorRole: {
        type: String,
        enum: ['ADMIN']
    }
}, mongooseOptions);

branchSchema.virtual('creatorModelName').get(function () {
    const roleMapping = { 'ADMIN': 'Admin' };
    return roleMapping[this.creatorRole] || this.creatorRole;
});

const Branch = mongoose.model('Branch', branchSchema);

async function runTest() {
    try {
        const admin = new Admin({ name: 'Test Admin' });
        const branch = new Branch({ name: 'Test Branch', createdBy: admin._id, creatorRole: 'ADMIN' });

        // Simulate populate
        await branch.populate('createdBy');
        console.log("Virtual Populate successful!");
        console.log(branch.createdBy.name);
    } catch (error) {
        console.error("Test Error:", error.message);
    } finally {
        process.exit(0);
    }
}

runTest();

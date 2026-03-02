const mongoose = require('mongoose');

const mongooseOptions = { strict: false };
const adminSchema = new mongoose.Schema({ name: String }, mongooseOptions);
const Admin = mongoose.model('Admin', adminSchema);
mongoose.model('ADMIN', adminSchema, 'admins'); // Double registration

const branchSchema = new mongoose.Schema({
    name: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'creatorRole'
    },
    creatorRole: {
        type: String,
        enum: ['ADMIN']
    }
}, mongooseOptions);

const Branch = mongoose.model('Branch', branchSchema);

async function runTest() {
    try {
        const admin = new Admin({ name: 'Test Admin' });
        const branch = new Branch({ name: 'Test Branch', createdBy: admin._id, creatorRole: 'ADMIN' });

        // Simulate populate directly without DB insert
        await branch.populate('createdBy');
        console.log("Local Direct Populate successful (No DB needed)!");
        console.log(branch.createdBy.name);

    } catch (error) {
        console.error("Test Error:", error.message);
    } finally {
        process.exit(0);
    }
}

runTest();

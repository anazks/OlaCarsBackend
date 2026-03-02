const mongoose = require('mongoose');

// Define simplified mock schemas just to test Mongoose refPath behavior
const mongooseOptions = { strict: false };

const adminSchema = new mongoose.Schema({ name: String }, mongooseOptions);
const Admin = mongoose.model('Admin', adminSchema);
mongoose.model('ADMIN', adminSchema, 'admins');

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

        // Simulate populate
        await branch.populate('createdBy');
        console.log("Populate successful!");
        console.log(branch.createdBy);
    } catch (error) {
        console.error("Test Error:", error.message);
    } finally {
        process.exit(0);
    }
}

runTest();

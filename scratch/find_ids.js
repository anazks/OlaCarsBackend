const mongoose = require('mongoose');
require('dotenv').config();

async function findIds() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const Branch = mongoose.model('Branch', new mongoose.Schema({}, { strict: false }));
        const Admin = mongoose.model('Admin', new mongoose.Schema({}, { strict: false }));

        const branch = await Branch.findOne({ isDeleted: false });
        const admin = await Admin.findOne({ email: 'admin@olacars.com' });

        if (!branch) throw new Error('No branch found');
        if (!admin) throw new Error('No admin found');

        console.log('BRANCH_ID:', branch._id);
        console.log('ADMIN_ID:', admin._id);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

findIds();

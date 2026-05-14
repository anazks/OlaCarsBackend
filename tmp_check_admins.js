
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const adminSchema = new mongoose.Schema({
    email: String,
    status: String,
    failedLoginAttempts: Number,
    lockUntil: Date
}, { collection: 'admins' });

const Admin = mongoose.model('Admin', adminSchema);

async function checkAdmins() {
    try {
        console.log('Connecting to:', MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const admins = await Admin.find({});
        console.log('Admins found:', admins.length);
        admins.forEach(admin => {
            console.log(`- Email: ${admin.email}, Status: ${admin.status}, Failed Attempts: ${admin.failedLoginAttempts}, Lock Until: ${admin.lockUntil}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkAdmins();

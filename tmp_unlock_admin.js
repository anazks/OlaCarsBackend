
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

async function unlockAdmin() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const result = await Admin.updateOne(
            { email: 'admin@olacars.com' },
            { 
                $set: { 
                    status: 'ACTIVE',
                    failedLoginAttempts: 0,
                    lockUntil: null 
                } 
            }
        );

        if (result.modifiedCount > 0) {
            console.log('Admin account admin@olacars.com unlocked successfully.');
        } else {
            console.log('Admin account not found or already unlocked.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

unlockAdmin();

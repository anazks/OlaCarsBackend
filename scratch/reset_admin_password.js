const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Admin = require('../Src/modules/Admin/model/adminModel');

async function reset() {
    try {
        console.log("Connecting...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        const admin = await Admin.findOne({ email: 'admin@olacars.com' });
        if (!admin) {
            console.error("Admin not found!");
            process.exit(1);
        }

        const newHash = await bcrypt.hash('Test@1234', 12);
        admin.passwordHash = newHash;
        admin.failedLoginAttempts = 0;
        admin.lockUntil = undefined;
        admin.status = 'ACTIVE';
        await admin.save();
        console.log("Admin password reset successfully to: Test@1234");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

reset();

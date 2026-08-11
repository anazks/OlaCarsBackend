const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const FinanceAdmin = require('../Src/modules/FinanceAdmin/Model/FinanceAdminModel');

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'financialadmin@olacars.com';
        const newPassword = 'Test@1234';
        const passwordHash = await bcrypt.hash(newPassword, 10);

        const result = await FinanceAdmin.updateOne(
            { email },
            { 
                $set: { 
                    passwordHash,
                    status: 'ACTIVE',
                    failedLoginAttempts: 0,
                    lockUntil: null,
                    passwordChangedAt: new Date()
                } 
            }
        );

        console.log('Update result:', result);

        const admin = await FinanceAdmin.findOne({ email });
        if (admin) {
            console.log(`Successfully updated password for ${email}`);
            console.log(`Status: ${admin.status}`);
            console.log(`Role: ${admin.role}`);
        } else {
            console.log(`User with email ${email} not found in FinanceAdmin collection!`);
        }
    } catch (err) {
        console.error('Error updating password:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();

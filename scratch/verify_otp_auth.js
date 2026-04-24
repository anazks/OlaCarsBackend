const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../Src/modules/User/Model/UserModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

async function verifyOTPAuth() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const testEmail = 'test_driver_otp@example.com';

        // 1. Cleanup existing test user
        await User.deleteOne({ email: testEmail });
        await Driver.deleteOne({ 'personalInfo.email': testEmail });
        console.log('Cleanup done');

        // 2. Test Registration (without password)
        const registerPayload = {
            fullName: 'Test Driver OTP',
            email: testEmail,
            phone: '1234567890'
        };

        const newUser = await User.create({
            fullName: registerPayload.fullName,
            email: registerPayload.email,
            phone: registerPayload.phone,
            role: 'USER',
            status: 'ACTIVE'
        });
        console.log('User created without passwordHash:', newUser._id);

        // 3. Test OTP Generation
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        newUser.otp = otp;
        newUser.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await newUser.save();
        console.log('OTP generated and saved:', otp);

        // 4. Verify OTP (Simulate login)
        const foundUser = await User.findOne({ email: testEmail });
        if (foundUser.otp === otp && foundUser.otpExpires > Date.now()) {
            console.log('OTP verification successful');
            foundUser.otp = undefined;
            foundUser.otpExpires = undefined;
            await foundUser.save();
            console.log('OTP cleared after verification');
        } else {
            console.error('OTP verification failed');
        }

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verifyOTPAuth();

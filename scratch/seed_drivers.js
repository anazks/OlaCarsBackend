const mongoose = require('mongoose');
require('dotenv').config();
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

async function seedDrivers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const branchId = '69f983399807cf101fda4e5e';
        const adminId = '69f5d6a29807cf101fda4498';

        const drivers = [
            {
                status: 'APPROVED',
                personalInfo: {
                    fullName: 'John Doe',
                    email: 'john.doe.test@example.com',
                    phone: '+1234567890',
                    nationality: 'British'
                },
                driverId: 'OLA-TEST-001',
                branch: branchId,
                createdBy: adminId,
                creatorRole: 'ADMIN'
            },
            {
                status: 'APPROVED',
                personalInfo: {
                    fullName: 'Jane Smith',
                    email: 'jane.smith.test@example.com',
                    phone: '+1987654321',
                    nationality: 'American'
                },
                driverId: 'OLA-TEST-002',
                branch: branchId,
                createdBy: adminId,
                creatorRole: 'ADMIN'
            },
            {
                status: 'APPROVED',
                personalInfo: {
                    fullName: 'Michael Brown',
                    email: 'michael.brown.test@example.com',
                    phone: '+1122334455',
                    nationality: 'Canadian'
                },
                driverId: 'OLA-TEST-003',
                branch: branchId,
                createdBy: adminId,
                creatorRole: 'ADMIN'
            }
        ];

        for (const dData of drivers) {
            const exists = await Driver.findOne({ 'personalInfo.email': dData.personalInfo.email });
            if (!exists) {
                const driver = new Driver(dData);
                await driver.save();
                console.log(`Driver ${dData.personalInfo.fullName} (${dData.driverId}) created.`);
            } else {
                console.log(`Driver ${dData.personalInfo.fullName} already exists.`);
            }
        }

        console.log('Seeding complete.');
    } catch (err) {
        console.error('Error seeding drivers:', err);
    } finally {
        await mongoose.connection.close();
    }
}

seedDrivers();

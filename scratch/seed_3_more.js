const mongoose = require('mongoose');
require('dotenv').config();
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const testData = [
    {
        driver: {
            fullName: 'Sarah Wilson',
            email: 'sarah.wilson.test@example.com',
            phone: '+1555001001',
            nationality: 'American',
            driverId: 'OLA-DEP-T02',
        },
        vehicle: {
            make: 'Hyundai',
            model: 'Elantra',
            year: 2025,
            vin: 'TEST-DEP-VEH-002',
            fleetNumber: 'V-DEP-T02',
            colour: 'Red',
            purchasePrice: 18000,
        },
    },
    {
        driver: {
            fullName: 'Marcus Johnson',
            email: 'marcus.johnson.test@example.com',
            phone: '+1555002002',
            nationality: 'Canadian',
            driverId: 'OLA-DEP-T03',
        },
        vehicle: {
            make: 'Kia',
            model: 'Sportage',
            year: 2025,
            vin: 'TEST-DEP-VEH-003',
            fleetNumber: 'V-DEP-T03',
            colour: 'Grey',
            purchasePrice: 28000,
        },
    },
    {
        driver: {
            fullName: 'Emily Chen',
            email: 'emily.chen.test@example.com',
            phone: '+1555003003',
            nationality: 'Australian',
            driverId: 'OLA-DEP-T04',
        },
        vehicle: {
            make: 'Mazda',
            model: 'CX-5',
            year: 2024,
            vin: 'TEST-DEP-VEH-004',
            fleetNumber: 'V-DEP-T04',
            colour: 'White',
            purchasePrice: 32000,
        },
    },
];

async function seedMore() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const branchId = '69f983399807cf101fda4e5e';
        const adminId = '69f5d6a29807cf101fda4498';

        for (const { driver: d, vehicle: v } of testData) {
            // ── Driver ──
            let driver = await Driver.findOne({ 'personalInfo.email': d.email });
            if (!driver) {
                driver = await Driver.create({
                    status: 'ACTIVE',
                    personalInfo: {
                        fullName: d.fullName,
                        email: d.email,
                        phone: d.phone,
                        nationality: d.nationality,
                        dateOfBirth: new Date('1992-03-20'),
                    },
                    driverId: d.driverId,
                    drivingLicense: { licenseNumber: `DL-${d.driverId}`, verificationStatus: 'VERIFIED' },
                    emergencyContact: { name: 'Emergency Contact', phone: '+1555999000', relationship: 'Sibling' },
                    branch: branchId,
                    createdBy: adminId,
                    creatorRole: 'ADMIN',
                });
                console.log(`✅ Driver: ${driver.personalInfo.fullName} (${driver._id})`);
            } else {
                console.log(`⚠️  Driver exists: ${driver.personalInfo.fullName} (${driver._id})`);
            }

            // ── Vehicle ──
            let vehicle = await Vehicle.findOne({ 'basicDetails.vin': v.vin });
            if (!vehicle) {
                vehicle = await Vehicle.create({
                    status: 'ACTIVE — AVAILABLE',
                    purchaseDetails: {
                        branch: branchId,
                        purchasePrice: v.purchasePrice,
                        currency: '$',
                        purchaseDate: new Date('2025-02-01'),
                        vendorName: 'Test Fleet Motors',
                    },
                    basicDetails: {
                        make: v.make,
                        model: v.model,
                        year: v.year,
                        category: 'Sedan',
                        fuelType: 'Petrol',
                        transmission: 'Automatic',
                        condition: 'New',
                        fleetNumber: v.fleetNumber,
                        vin: v.vin,
                        engineNumber: `ENG-${v.vin}`,
                        colour: v.colour,
                        sellingValue: v.purchasePrice,
                    },
                    createdBy: adminId,
                    creatorRole: 'ADMIN',
                });
                console.log(`✅ Vehicle: ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle._id})`);
            } else {
                console.log(`⚠️  Vehicle exists: ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle._id})`);
            }

            console.log(`   → ${d.fullName} ↔ ${v.make} ${v.model} ($${v.purchasePrice})\n`);
        }

        console.log('Done — 3 additional driver+vehicle pairs seeded.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

seedMore();

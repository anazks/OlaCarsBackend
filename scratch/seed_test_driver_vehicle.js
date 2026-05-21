const mongoose = require('mongoose');
require('dotenv').config();
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

async function seedTestDriverAndVehicle() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const branchId = '69f983399807cf101fda4e5e';
        const adminId = '69f5d6a29807cf101fda4498';

        // ── 1. Create Test Driver (ACTIVE — ready for vehicle assignment) ──
        const testDriverEmail = 'deposit.test.driver@example.com';
        let driver = await Driver.findOne({ 'personalInfo.email': testDriverEmail });
        if (!driver) {
            driver = await Driver.create({
                status: 'ACTIVE',
                personalInfo: {
                    fullName: 'Deposit Test Driver',
                    email: testDriverEmail,
                    phone: '+1555000999',
                    nationality: 'British',
                    dateOfBirth: new Date('1990-05-15'),
                },
                driverId: 'OLA-DEP-TEST',
                drivingLicense: {
                    licenseNumber: 'DL-TEST-DEP-001',
                    verificationStatus: 'VERIFIED',
                },
                emergencyContact: {
                    name: 'Emergency Person',
                    phone: '+1555111222',
                    relationship: 'Spouse',
                },
                branch: branchId,
                createdBy: adminId,
                creatorRole: 'ADMIN',
            });
            console.log(`✅ Driver created: ${driver.personalInfo.fullName} (${driver._id})`);
        } else {
            console.log(`⚠️  Driver already exists: ${driver.personalInfo.fullName} (${driver._id})`);
        }

        // ── 2. Create Test Vehicle (AVAILABLE — ready for assignment) ──
        const testVin = 'TEST-DEP-VEH-001';
        let vehicle = await Vehicle.findOne({ 'basicDetails.vin': testVin });
        if (!vehicle) {
            vehicle = await Vehicle.create({
                status: 'ACTIVE — AVAILABLE',
                purchaseDetails: {
                    branch: branchId,
                    purchasePrice: 20000,
                    currency: '$',
                    purchaseDate: new Date('2025-01-10'),
                    vendorName: 'Test Motors Ltd',
                },
                basicDetails: {
                    make: 'Nissan',
                    model: 'Sentra',
                    year: 2025,
                    category: 'Sedan',
                    fuelType: 'Petrol',
                    transmission: 'Automatic',
                    condition: 'New',
                    fleetNumber: 'V-DEP-TEST',
                    vin: testVin,
                    engineNumber: 'ENG-DEP-TEST-001',
                    colour: 'Blue',
                    sellingValue: 20000,
                },
                createdBy: adminId,
                creatorRole: 'ADMIN',
            });
            console.log(`✅ Vehicle created: ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle._id})`);
        } else {
            console.log(`⚠️  Vehicle already exists: ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle._id})`);
        }

        console.log('\n────────────────────────────────────────');
        console.log('  TEST DATA READY FOR DEPOSIT FLOW');
        console.log('────────────────────────────────────────');
        console.log(`  Driver ID:  ${driver._id}`);
        console.log(`  Driver:     ${driver.personalInfo.fullName}`);
        console.log(`  Vehicle ID: ${vehicle._id}`);
        console.log(`  Vehicle:    ${vehicle.basicDetails.make} ${vehicle.basicDetails.model}`);
        console.log(`  Price:      $${vehicle.purchaseDetails.purchasePrice}`);
        console.log('────────────────────────────────────────');
        console.log('  Next: Assign vehicle to driver with a deposit via the UI');
        console.log('────────────────────────────────────────\n');

    } catch (err) {
        console.error('Error seeding test data:', err);
    } finally {
        await mongoose.connection.close();
        console.log('DB connection closed.');
    }
}

seedTestDriverAndVehicle();

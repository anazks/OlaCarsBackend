const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

// Register models to avoid Schema hasn't been registered errors
const Branch = require('../src/modules/Branch/Model/BranchModel');
const Customer = require('../src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../src/modules/Vehicle/Model/VehicleModel');
const DriverService = require('../src/modules/Driver/Service/DriverService');
const SystemSettings = require('../src/modules/SystemSettings/Model/SystemSettingsModel');
require('dotenv').config();

const runTest = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const branchId = new mongoose.Types.ObjectId();
        const randomVin = 'TESTVIN' + Math.floor(Math.random() * 1000000000);
        const randomCustId = 'CUST-TEST-' + Math.floor(Math.random() * 1000000);
        const randomCode = 'TB' + Math.floor(Math.random() * 10000);

        // Create a mock Branch record so populate can find it
        console.log('\n--- Creating Mock Branch ---');
        const branch = new Branch({
            _id: branchId,
            name: 'Test Branch',
            code: randomCode,
            city: 'Test City',
            state: 'TS',
            country: 'TC',
            phone: '+1555111222',
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: 'ADMIN'
        });
        await branch.save();

        // 1. Create test vehicle
        console.log('\n--- 1. Creating Test Vehicle ---');
        const vehicle = new Vehicle({
            status: 'ACTIVE — RENTED',
            basicDetails: {
                make: 'TestMake',
                model: 'TestModel',
                year: 2024,
                weeklyRent: 150,
                vin: randomVin
            },
            purchaseDetails: {
                branch: branchId
            },
            legalDocs: {
                registrationNumber: 'TESTREG123'
            },
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: 'ADMIN'
        });
        await vehicle.save();
        console.log(`Test Vehicle created with ID: ${vehicle._id}, VIN: ${randomVin}, weeklyRent: ${vehicle.basicDetails.weeklyRent}`);

        // 2. Create test driver
        console.log('\n--- 2. Creating Test Driver ---');
        const driver = new Driver({
            status: 'ACTIVE',
            personalInfo: {
                fullName: 'Test Driver Cancel',
                email: 'testdrivercancel@olacars.com',
                phone: '+1555000999'
            },
            currentVehicle: vehicle._id,
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: 'ADMIN',
            branch: branchId
        });
        await driver.save();
        console.log(`Test Driver created with ID: ${driver._id}, status: ${driver.status}`);

        // Establish link from vehicle to driver
        vehicle.currentDriver = driver._id;
        await vehicle.save();

        // 3. Create test customer
        console.log('\n--- 3. Creating Test Customer ---');
        const customer = new Customer({
            customerId: randomCustId,
            name: driver.personalInfo.fullName,
            email: driver.personalInfo.email,
            status: 'ACTIVE',
            driver: driver._id,
            cfActiveDate: new Date('2026-06-01'),
            branch: branchId
        });
        await customer.save();
        console.log(`Test Customer created with ID: ${customer._id}, status: ${customer.status}`);

        // 4. Generate rent tracking plan (simulate some elapsed and some future weeks)
        console.log('\n--- 4. Setting up Rent Repayment Plan ---');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // We will mock a rent plan with 3 weeks in the past and 3 weeks in the future
        const mockTracking = [];
        for (let i = 1; i <= 6; i++) {
            const dueDate = new Date(today);
            // weeks 1, 2, 3 in past (-21, -14, -7 days)
            // weeks 4, 5, 6 in future (+0, +7, +14, +21 days)
            dueDate.setDate(today.getDate() + (i - 4) * 7);

            mockTracking.push({
                weekNumber: i,
                weekLabel: `Week ${i} - ${dueDate.toLocaleDateString()}`,
                dueDate: dueDate,
                amount: 150,
                carryOver: 0,
                totalDue: 150,
                amountPaid: i < 3 ? 150 : 0, // weeks 1 & 2 PAID, week 3 PENDING but elapsed, weeks 4-6 PENDING in future
                balance: i < 3 ? 0 : 150,
                status: i < 3 ? "PAID" : "PENDING",
                payments: []
            });
        }

        driver.rentTracking = mockTracking;
        await driver.save();
        console.log(`Created mock rentTracking with ${mockTracking.length} weeks.`);
        mockTracking.forEach(w => {
            console.log(` - Week ${w.weekNumber}: Due: ${w.dueDate.toISOString().split('T')[0]}, Status: ${w.status}`);
        });

        // 5. Trigger cancelContract logic (Simulate API request)
        console.log('\n--- 5. Simulating cancelContract API ---');
        const cancelNotes = 'Driver requested termination due to relocation.';
        
        // Load driver, vehicle, customer
        const d = await Driver.findById(driver._id);
        const v = await Vehicle.findById(vehicle._id);
        const c = await Customer.findOne({ driver: driver._id });

        // Keep past/elapsed weeks
        const keptInstallments = (d.rentTracking || []).filter(item => {
            if (item.status !== 'PENDING') return true;
            const itemDueDate = new Date(item.dueDate);
            itemDueDate.setHours(0, 0, 0, 0);
            if (itemDueDate <= today) return true;
            return false;
        });

        // Release vehicle
        v.currentDriver = null;
        v.status = 'ACTIVE — AVAILABLE';
        v.statusHistory.push({
            status: 'ACTIVE — AVAILABLE',
            changedBy: d.createdBy,
            changedByRole: d.creatorRole,
            timestamp: new Date(),
            notes: `Contract cancelled for driver ${d.personalInfo?.fullName}. Vehicle released.`,
        });
        await v.save();

        // Update driver
        d.status = 'INACTIVE';
        d.currentVehicle = null;
        d.rentTracking = keptInstallments;
        d.statusHistory.push({
            status: 'INACTIVE',
            changedBy: d.createdBy,
            changedByRole: d.creatorRole,
            timestamp: new Date(),
            notes: cancelNotes,
        });
        await d.save();

        // Update customer
        c.status = 'INACTIVE';
        await c.save();

        console.log('Cancellation execution completed. Verifying results:');

        // Verification checks
        const updatedDriver = await Driver.findById(driver._id);
        const updatedVehicle = await Vehicle.findById(vehicle._id);
        const updatedCustomer = await Customer.findById(customer._id);

        console.log(`- Driver status: ${updatedDriver.status} (Expected: INACTIVE)`);
        console.log(`- Driver currentVehicle: ${updatedDriver.currentVehicle} (Expected: null)`);
        console.log(`- Vehicle status: ${updatedVehicle.status} (Expected: ACTIVE — AVAILABLE)`);
        console.log(`- Vehicle currentDriver: ${updatedVehicle.currentDriver} (Expected: null)`);
        console.log(`- Customer status: ${updatedCustomer.status} (Expected: INACTIVE)`);
        console.log(`- Kept installments count: ${updatedDriver.rentTracking.length} (Expected: 4 - Weeks 1, 2, 3, 4)`);
        
        updatedDriver.rentTracking.forEach(w => {
            console.log(`   - Week ${w.weekNumber}: Due: ${w.dueDate.toISOString().split('T')[0]}, Status: ${w.status}`);
        });

        // 6. Simulate Re-contracting
        console.log('\n--- 6. Simulating Re-contracting ---');
        // Let's reactivate driver, assign them back to active, assign the vehicle, and generate a new plan (e.g. 4 weeks)
        updatedDriver.status = 'ACTIVE';
        updatedDriver.currentVehicle = updatedVehicle._id;
        await updatedDriver.save();

        updatedVehicle.status = 'ACTIVE — RENTED';
        updatedVehicle.currentDriver = updatedDriver._id;
        await updatedVehicle.save();

        // Generate new plan (e.g., weekly rent of $160, for 4 weeks)
        const reContractedDriver = await DriverService.generateRentPlan(updatedDriver._id, {
            weeklyRent: 160,
            durationWeeks: 4,
            frequency: 'WEEKLY'
        });

        console.log(`Re-contracting completed! Checking combined rentTracking:`);
        console.log(`- Total installments count: ${reContractedDriver.rentTracking.length} (Expected: 8)`);
        reContractedDriver.rentTracking.forEach(w => {
            console.log(`   - Week ${w.weekNumber} (${w.weekLabel}): Amount: $${w.amount}, Due: ${w.dueDate.toISOString().split('T')[0]}, Status: ${w.status}`);
        });

        // Clean up test records
        console.log('\n--- Cleaning up test records ---');
        await Driver.findByIdAndDelete(driver._id);
        await Vehicle.findByIdAndDelete(vehicle._id);
        await Customer.findByIdAndDelete(customer._id);
        await Branch.findByIdAndDelete(branchId);
        console.log('Cleanup done!');

        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
};

runTest();

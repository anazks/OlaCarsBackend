const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

const Customer = require('../src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../src/modules/Vehicle/Model/VehicleModel');
const SystemSettings = require('../src/modules/SystemSettings/Model/SystemSettingsModel');
require('dotenv').config();

const runMigration = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        // Fetch invoice generation day from settings (default Wednesday = 3)
        const setting = await SystemSettings.findOne({ key: 'invoice_generation_day' });
        const targetDay = setting && setting.value !== undefined ? Number(setting.value) : 3;
        console.log(`System invoice generation target day of week: ${targetDay} (0 = Sun, 3 = Wed, etc.)`);

        const activeDrivers = await Driver.find({ isDeleted: false, status: 'ACTIVE' });
        console.log(`Found ${activeDrivers.length} active drivers to process.`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let successCount = 0;
        let skippedCount = 0;

        for (const driver of activeDrivers) {
            const fullName = driver.personalInfo?.fullName || 'N/A';
            const driverIdStr = driver.driverId || driver._id.toString();

            // Find customer
            const customer = await Customer.findOne({ driver: driver._id, isDeleted: false });
            if (!customer) {
                console.log(`[SKIP] Driver ${fullName} (${driverIdStr}) - No associated customer found.`);
                skippedCount++;
                continue;
            }

            const activationDate = customer.cfActiveDate;
            if (!activationDate) {
                console.log(`[SKIP] Driver ${fullName} (${driverIdStr}) - Customer ${customer.name} is missing cfActiveDate.`);
                skippedCount++;
                continue;
            }

            // Find vehicle rent
            if (!driver.currentVehicle) {
                console.log(`[SKIP] Driver ${fullName} (${driverIdStr}) - No current vehicle assigned.`);
                skippedCount++;
                continue;
            }

            const vehicle = await Vehicle.findById(driver.currentVehicle);
            if (!vehicle) {
                console.log(`[SKIP] Driver ${fullName} (${driverIdStr}) - Vehicle ID ${driver.currentVehicle} not found.`);
                skippedCount++;
                continue;
            }

            const weeklyRent = vehicle.basicDetails?.weeklyRent;
            if (weeklyRent === undefined || weeklyRent === null) {
                console.log(`[SKIP] Driver ${fullName} (${driverIdStr}) - Vehicle ${vehicle.legalDocs?.registrationNumber || 'N/A'} has no weeklyRent defined.`);
                skippedCount++;
                continue;
            }

            // Calculate starting date
            const parsedActivationDate = new Date(activationDate);
            parsedActivationDate.setHours(0, 0, 0, 0);

            let nextDueDate = new Date(parsedActivationDate);
            const currentDay = nextDueDate.getDay();
            const daysUntilTarget = (targetDay - currentDay + 7) % 7;
            const offset = daysUntilTarget === 0 ? 7 : daysUntilTarget;
            nextDueDate.setDate(nextDueDate.getDate() + offset);

            const installments = [];
            const totalDurationWeeks = 260; // 5 years

            for (let i = 0; i < totalDurationWeeks; i++) {
                const dueDate = new Date(nextDueDate);
                dueDate.setDate(nextDueDate.getDate() + (i * 7));

                // Skip installments before today (elapsed weeks)
                if (dueDate < today) {
                    continue;
                }

                const periodNum = i + 1;
                installments.push({
                    weekNumber: periodNum,
                    weekLabel: `Week ${periodNum} - ${dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`,
                    dueDate: dueDate,
                    amount: weeklyRent,
                    carryOver: 0,
                    totalDue: weeklyRent,
                    amountPaid: 0,
                    balance: weeklyRent,
                    status: "PENDING",
                    payments: [],
                });
            }

            // Update driver rent tracking
            await Driver.findByIdAndUpdate(driver._id, {
                $set: { rentTracking: installments }
            });

            console.log(`[SUCCESS] Driver ${fullName} (${driverIdStr}) - Generated ${installments.length} future weeks starting from ${activationDate.toISOString().split('T')[0]} (Weekly rent: $${weeklyRent})`);
            successCount++;
        }

        console.log(`\nMigration Completed!`);
        console.log(`Successfully migrated: ${successCount}`);
        console.log(`Skipped: ${skippedCount}`);

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();

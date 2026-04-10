require('dotenv').config();
const mongoose = require('mongoose');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

async function verify() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const driver = await Driver.findOne({ isDeleted: false });
        const vehicle = await Vehicle.findOne({ status: 'ACTIVE — AVAILABLE', isDeleted: false });

        if (!driver || !vehicle) {
            console.log('Could not find suitable driver or vehicle for test');
            process.exit(1);
        }

        console.log(`Driver: ${driver.personalInfo.fullName} (${driver._id})`);
        console.log(`Vehicle: ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle._id})`);
        
        // We'll mock the assign-car-to-driver logic here to test the service call
        const DriverService = require('../Src/modules/Driver/Service/DriverService');
        
        const monthlyRent = vehicle.basicDetails.monthlyRent || 1000;
        const durationMonths = vehicle.basicDetails.leaseDurationMonths || 60;
        
        console.log(`Generating plan for ${durationMonths} months @ $${monthlyRent}/mo starting 3rd of next month`);
        
        await DriverService.generateRentPlan(driver._id, {
            monthlyRent,
            durationMonths,
            startFromNextMonth: true
        });

        const updatedDriver = await Driver.findById(driver._id);
        console.log(`Updated rentTracking count: ${updatedDriver.rentTracking.length}`);
        
        if (updatedDriver.rentTracking.length > 0) {
            console.log('SUCCESS: Rent plan generated verified.');
            const first = updatedDriver.rentTracking[updatedDriver.rentTracking.length - durationMonths];
            const second = updatedDriver.rentTracking[updatedDriver.rentTracking.length - durationMonths + 1];
            
            console.log('First installment:', {
                month: first.month,
                year: first.year,
                dueDate: first.dueDate,
                status: first.status
            });
            console.log('Second installment:', {
                month: second.month,
                year: second.year,
                dueDate: second.dueDate,
                status: second.status
            });
            
            const isThird = first.dueDate.getDate() === 3;
            console.log(`Is first payment on the 3rd? ${isThird ? 'YES' : 'NO'}`);
        } else {
            console.log('FAILURE: Rent plan generation failed.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();

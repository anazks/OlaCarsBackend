const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
        const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

        const custs = await Customer.find({ customerId: { $in: ["CUST-006400", "CUST-006399"] } }).lean();
        console.log("=== CUSTOMERS ===");
        custs.forEach(c => {
            console.log({
                _id: c._id,
                customerId: c.customerId,
                name: c.name,
                email: c.email,
                phone: c.phone,
                status: c.status,
                driver: c.driver,
                cfVehicleNo: c.cfVehicleNo,
                cfActiveDate: c.cfActiveDate,
                createdAt: c.createdAt
            });
        });

        const vehs = await Vehicle.find({ "legalDocs.registrationNumber": "EV6637" }).lean();
        console.log("\n=== VEHICLES WITH PLATE EV6637 ===");
        vehs.forEach(v => {
            console.log({
                _id: v._id,
                status: v.status,
                currentDriver: v.currentDriver,
                registrationNumber: v.legalDocs?.registrationNumber,
                statusHistory: v.statusHistory
            });
        });

        if (custs[0]?.driver) {
            const d1 = await Driver.findById(custs[0].driver).select("driverId personalInfo status currentVehicle deactivationDate rentTracking").lean();
            console.log("\n=== DRIVER FOR " + custs[0].customerId + " ===");
            console.log({
                _id: d1?._id,
                driverId: d1?.driverId,
                name: d1?.personalInfo?.fullName,
                status: d1?.status,
                currentVehicle: d1?.currentVehicle
            });
        }

        if (custs[1]?.driver) {
            const d2 = await Driver.findById(custs[1].driver).select("driverId personalInfo status currentVehicle deactivationDate rentTracking").lean();
            console.log("\n=== DRIVER FOR " + custs[1].customerId + " ===");
            console.log({
                _id: d2?._id,
                driverId: d2?.driverId,
                name: d2?.personalInfo?.fullName,
                status: d2?.status,
                currentVehicle: d2?.currentVehicle
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const connectDB = require("../Src/config/dbConfig");

const Agreement = require("../Src/modules/Agreement/Model/AgreementModel");
const Lease = require("../Src/modules/Lease/Model/LeaseModel");

async function main() {
    await connectDB();
    const customerId = '6a82c8d43f7babe484dc9891';
    const driverId = '6a82c8d33f7babe484dc988e';
    const vehicleId = '6a28214ac3bc99646284878d';

    const agreements = await Agreement.find({
        $or: [
            { customer: customerId },
            { driver: driverId },
            { vehicle: vehicleId }
        ]
    }).lean();
    console.log(`Found ${agreements.length} agreements`);
    if (agreements.length > 0) {
        console.log(JSON.stringify(agreements, null, 2));
    }

    const leases = await Lease.find({
        $or: [
            { customer: customerId },
            { driver: driverId },
            { vehicle: vehicleId }
        ]
    }).lean();
    console.log(`Found ${leases.length} leases`);
    if (leases.length > 0) {
        console.log(JSON.stringify(leases, null, 2));
    }

    await mongoose.disconnect();
}

main().catch(console.error);

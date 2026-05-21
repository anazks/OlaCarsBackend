const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        console.log("Connecting to:", MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully!");

        // Load models
        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
        const Driver = require('../Src/modules/Driver/Model/DriverModel');

        const payments = await PaymentReceived.find({})
            .populate('driverId', 'personalInfo driverId')
            .limit(5);

        console.log(`Found ${payments.length} payment records.`);
        payments.forEach((p, idx) => {
            console.log(`\n--- Record #${idx + 1} ---`);
            console.log(`_id: ${p._id}`);
            console.log(`paymentNumber: ${p.paymentNumber}`);
            console.log(`driverId raw: ${p.toObject().driverId}`);
            console.log(`driverId populated:`, p.driverId);
            console.log(`amountReceived: ${p.amountReceived}`);
            console.log(`status: ${p.status}`);
        });

    } catch (err) {
        console.error("Error running diagnostic:", err);
    } finally {
        await mongoose.connection.close();
        console.log("Connection closed.");
    }
}

run();

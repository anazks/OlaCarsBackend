const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        console.log("Connecting to:", MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully!\n");

        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');

        // Query payments where invoices array is empty, not present, or length is 0
        const payments = await PaymentReceived.find({
            $or: [
                { invoices: { $size: 0 } },
                { invoices: { $exists: false } },
                { invoices: null }
            ]
        });

        console.log(`Found ${payments.length} payment receives with no invoices connected:`);
        console.log("=========================================");
        payments.forEach((p, idx) => {
            console.log(`${idx + 1}. Payment Number: ${p.paymentNumber} (Amount: ${p.amountReceived}, Status: ${p.status})`);
        });
        console.log("=========================================");

    } catch (err) {
        console.error("Error executing query:", err);
    } finally {
        await mongoose.connection.close();
        console.log("\nConnection closed.");
    }
}

run();

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

        // Let's count:
        // 1. empty/no invoices:
        const noInvoicesCount = await PaymentReceived.countDocuments({
            $or: [
                { invoices: { $size: 0 } },
                { invoices: { $exists: false } },
                { invoices: null }
            ]
        });

        // 2. has invoices but sum of amountApplied is 0
        const paymentsWithInvoices = await PaymentReceived.find({
            invoices: { $exists: true, $not: { $size: 0 }, $ne: null }
        });

        let zeroAppliedCount = 0;
        const zeroAppliedPaymentNumbers = [];
        for (const p of paymentsWithInvoices) {
            const sumApplied = p.invoices.reduce((sum, inv) => sum + (inv.amountApplied || 0), 0);
            if (sumApplied === 0) {
                zeroAppliedCount++;
                zeroAppliedPaymentNumbers.push(p.paymentNumber);
            }
        }

        console.log(`Payments with NO invoices connected: ${noInvoicesCount}`);
        console.log(`Payments with invoices connected but total amountApplied is 0: ${zeroAppliedCount}`);
        if (zeroAppliedCount > 0) {
            console.log("Payment numbers with 0 applied amount despite having invoice links:", zeroAppliedPaymentNumbers.slice(0, 10));
        }

    } catch (err) {
        console.error("Error executing query:", err);
    } finally {
        await mongoose.connection.close();
        console.log("\nConnection closed.");
    }
}

run();

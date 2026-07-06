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
        const PaymentTransaction = require('../Src/modules/Payment/Model/PaymentTransactionModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

        // 1. Update PaymentReceived documents
        const prResult = await PaymentReceived.updateMany(
            { paymentMethod: "Bank  Transfer" },
            { $set: { paymentMethod: "Bank Transfer" } }
        );
        console.log(`Updated ${prResult.modifiedCount} PaymentReceived documents.`);

        // 2. Update PaymentTransaction documents
        const ptResult = await PaymentTransaction.updateMany(
            { paymentMethod: "Bank  Transfer" },
            { $set: { paymentMethod: "Bank Transfer" } }
        );
        console.log(`Updated ${ptResult.modifiedCount} PaymentTransaction documents.`);

        // 3. Update Invoice subdocuments in the payments array
        // We find invoices containing payments with paymentMethod: "Bank  Transfer"
        const invoices = await Invoice.find({ "payments.paymentMethod": "Bank  Transfer" });
        console.log(`Found ${invoices.length} invoices with "Bank  Transfer" in their payments array.`);

        let invoiceUpdateCount = 0;
        for (const invoice of invoices) {
            let modified = false;
            for (const payment of invoice.payments) {
                if (payment.paymentMethod === "Bank  Transfer") {
                    payment.paymentMethod = "Bank Transfer";
                    modified = true;
                }
            }
            if (modified) {
                await invoice.save();
                invoiceUpdateCount++;
            }
        }
        console.log(`Updated ${invoiceUpdateCount} Invoice documents.`);

    } catch (err) {
        console.error("Error running migration:", err);
    } finally {
        await mongoose.connection.close();
        console.log("\nConnection closed.");
    }
}

run();

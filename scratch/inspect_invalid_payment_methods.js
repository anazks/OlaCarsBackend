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
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

        // Check PaymentReceived
        const prs = await PaymentReceived.find({ paymentMethod: /bank/i });
        const uniquePrMethods = new Set(prs.map(p => p.paymentMethod));
        console.log("Unique PaymentReceived paymentMethods with 'bank':", Array.from(uniquePrMethods).map(m => `"${m}" (length ${m.length})`));

        // Check Invoices
        const invs = await Invoice.find({ "payments.paymentMethod": /bank/i });
        const uniqueInvMethods = new Set();
        for (const inv of invs) {
            for (const p of inv.payments) {
                if (/bank/i.test(p.paymentMethod)) {
                    uniqueInvMethods.add(p.paymentMethod);
                }
            }
        }
        console.log("Unique Invoice paymentMethods with 'bank':", Array.from(uniqueInvMethods).map(m => `"${m}" (length ${m ? m.length : 0})`));

    } catch (err) {
        console.error("Error inspecting:", err);
    } finally {
        await mongoose.connection.close();
    }
}

run();

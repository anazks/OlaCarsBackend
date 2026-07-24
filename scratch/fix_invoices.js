const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function fixInvoices() {
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;
        const invoicesCol = db.collection('invoices');

        console.log('\n--- 1. Cleaning up INV-16963 ---');
        const inv16963 = await invoicesCol.findOne({ invoiceNumber: "INV-16963" });
        if (inv16963) {
            console.log('Original INV-16963 lineItems count:', inv16963.lineItems.length);
            // Filter out the erroneously added second line item
            const cleanLineItems = inv16963.lineItems.filter(item => item.name !== "INV-16963");
            const subtotal = 261.68;
            const taxAmount = 18.32;
            const totalAmountDue = 280;
            const amountPaid = 280;
            const balance = 0;
            const status = "PAID";

            await invoicesCol.updateOne(
                { _id: inv16963._id },
                {
                    $set: {
                        lineItems: cleanLineItems,
                        subtotal,
                        taxAmount,
                        totalAmountDue,
                        amountPaid,
                        balance,
                        status,
                        updatedAt: new Date()
                    }
                }
            );
            console.log('Successfully reverted INV-16963 to original state (Status: PAID, Balance: 0).');
        }

        console.log('\n--- 2. Cleaning up SALDO INSUFICIENTE PANAPASS ---');
        const invPanapass = await invoicesCol.findOne({ invoiceNumber: "SALDO INSUFICIENTE PANAPASS" });
        if (invPanapass) {
            console.log('Original SALDO INSUFICIENTE PANAPASS lineItems count:', invPanapass.lineItems.length);
            const cleanLineItems = invPanapass.lineItems.filter(item => item.name !== "SALDO INSUFICIENTE PANAPASS");
            const subtotal = 25.33;
            const taxAmount = 1.77;
            const totalAmountDue = 27.1;
            const amountPaid = 27.1;
            const balance = 0;
            const status = "PAID";

            await invoicesCol.updateOne(
                { _id: invPanapass._id },
                {
                    $set: {
                        lineItems: cleanLineItems,
                        subtotal,
                        taxAmount,
                        totalAmountDue,
                        amountPaid,
                        balance,
                        status,
                        updatedAt: new Date()
                    }
                }
            );
            console.log('Successfully reverted SALDO INSUFICIENTE PANAPASS to original state (Status: PAID, Balance: 0).');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

fixInvoices();

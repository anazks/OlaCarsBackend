const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function main() {
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;
        const invoicesCol = db.collection('invoices');

        const targets = ["PENDING BALANCE FROM EQ9041", "INV-16963", "SALDO INSUFICIENTE PANAPASS"];

        for (const num of targets) {
            const inv = await invoicesCol.findOne({ invoiceNumber: num });
            console.log(`\n========================================`);
            console.log(`Invoice: ${num}`);
            console.log(`========================================`);
            if (inv) {
                console.log(`_id: ${inv._id}`);
                console.log(`status: ${inv.status}`);
                console.log(`totalAmountDue: ${inv.totalAmountDue}`);
                console.log(`amountPaid: ${inv.amountPaid}`);
                console.log(`balance: ${inv.balance}`);
                console.log(`lineItems count: ${inv.lineItems.length}`);
                console.log(`lineItems:`, JSON.stringify(inv.lineItems, null, 2));
            } else {
                console.log('NOT FOUND');
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();

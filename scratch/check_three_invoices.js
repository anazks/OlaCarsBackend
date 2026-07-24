const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function checkThreeInvoices() {
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;
        const invoicesCol = db.collection('invoices');

        const searchKeys = [
            '6671277000016713892', 'PENDING BALANCE FROM EQ9041',
            '6671277000015479106', 'INV-16963',
            '6671277000015636066', 'SALDO INSUFICIENTE PANAPASS'
        ];

        console.log('Checking for the 3 invoices in database...');
        for (const key of searchKeys) {
            const found = await invoicesCol.find({
                $or: [
                    { invoiceNumber: key },
                    { invoiceID: key },
                    { notes: new RegExp(key, 'i') }
                ]
            }).toArray();
            console.log(`Query "${key}": Found ${found.length} invoice(s).`);
            found.forEach(inv => {
                console.log(`  _id: ${inv._id}, invoiceNumber: ${inv.invoiceNumber}, status: ${inv.status}, totalAmountDue: ${inv.totalAmountDue}`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkThreeInvoices();

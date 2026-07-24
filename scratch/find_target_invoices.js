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

        // Query invoices collection directly to see raw fields
        const invoicesCollection = db.collection('invoices');

        console.log('\n--- 1. Searching for invoiceNumber: INV-010703 ---');
        const inv010703 = await invoicesCollection.find({ invoiceNumber: { $regex: 'INV-010703', $options: 'i' } }).toArray();
        console.log(`Found ${inv010703.length} invoice(s) matching INV-010703:`);
        console.log(JSON.stringify(inv010703, null, 2));

        console.log('\n--- 2. Searching for "TOW TRUCK" across invoice fields ---');
        const towTruckInvoices = await invoicesCollection.find({
            $or: [
                { invoiceNumber: { $regex: 'TOW TRUCK', $options: 'i' } },
                { invoiceID: { $regex: 'TOW TRUCK', $options: 'i' } },
                { notes: { $regex: 'TOW TRUCK', $options: 'i' } },
                { 'lineItems.name': { $regex: 'TOW TRUCK', $options: 'i' } },
                { 'lineItems.description': { $regex: 'TOW TRUCK', $options: 'i' } }
            ]
        }).toArray();
        console.log(`Found ${towTruckInvoices.length} invoice(s) matching TOW TRUCK:`);
        console.log(JSON.stringify(towTruckInvoices, null, 2));

        console.log('\n--- 3. Also checking ServiceBills collection for TOW TRUCK or INV-010703 ---');
        const serviceBillsCol = db.collection('servicebills');
        const serviceBills = await serviceBillsCol.find({
            $or: [
                { billNumber: { $regex: 'INV-010703|TOW TRUCK', $options: 'i' } },
                { description: { $regex: 'TOW TRUCK', $options: 'i' } },
                { category: { $regex: 'TOW TRUCK', $options: 'i' } }
            ]
        }).toArray();
        console.log(`Found ${serviceBills.length} service bill(s):`);
        console.log(JSON.stringify(serviceBills, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

main();

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
        const invoicesCollection = db.collection('invoices');

        // Target Invoice IDs found previously
        const targetIds = [
            new mongoose.Types.ObjectId("6a2876b10144f4440b103a29"), // INV-010703
            new mongoose.Types.ObjectId("6a2874880144f4440b0fdea8")  // TOW TRUCK SERVICE
        ];

        // Perform soft delete by setting isDeleted: true
        const result = await invoicesCollection.updateMany(
            { _id: { $in: targetIds } },
            { $set: { isDeleted: true, updatedAt: new Date() } }
        );

        console.log(`Soft delete update result: matched ${result.matchedCount}, modified ${result.modifiedCount}`);

        // Verify updated state
        const updatedInvoices = await invoicesCollection.find({ _id: { $in: targetIds } }).toArray();
        console.log('\n--- Verified Updated Invoices ---');
        updatedInvoices.forEach(inv => {
            console.log(`ID: ${inv._id}, InvoiceNumber: ${inv.invoiceNumber}, isDeleted: ${inv.isDeleted}, updatedAt: ${inv.updatedAt}`);
        });

    } catch (err) {
        console.error('Error executing soft delete:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

main();

const mongoose = require('mongoose');
require('dotenv').config();

async function fixIndexes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const collection = mongoose.connection.collection('invoices');
        
        console.log('Dropping old index driver_1_weekNumber_1...');
        try {
            await collection.dropIndex('driver_1_weekNumber_1');
            console.log('Dropped successfully.');
        } catch (err) {
            console.log('Index did not exist or already dropped:', err.message);
        }

        console.log('Creating new partial index for RENTAL invoices...');
        await collection.createIndex(
            { driver: 1, weekNumber: 1 }, 
            { 
                unique: true, 
                partialFilterExpression: { invoiceType: 'RENTAL' },
                name: 'driver_1_weekNumber_1'
            }
        );
        console.log('Index created successfully.');

        process.exit(0);
    } catch (err) {
        console.error('Fix failed:', err);
        process.exit(1);
    }
}

fixIndexes();

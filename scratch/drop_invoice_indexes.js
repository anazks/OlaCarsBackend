const mongoose = require('mongoose');
require('dotenv').config();

const dropIndexes = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/olacars';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const collection = mongoose.connection.collection('invoices');
        
        console.log('Current indexes:');
        const indexes = await collection.indexes();
        console.log(JSON.stringify(indexes, null, 2));

        try {
            await collection.dropIndex('invoiceNumber_1');
            console.log('Dropped invoiceNumber_1');
        } catch (e) {
            console.log('Could not drop invoiceNumber_1 (maybe it doesn\'t exist with this name)');
        }

        try {
            await collection.dropIndex('driver_1_weekNumber_1');
            console.log('Dropped driver_1_weekNumber_1');
        } catch (e) {
            console.log('Could not drop driver_1_weekNumber_1');
        }

        console.log('Finished dropping indexes. Mongoose will recreate them with partial expressions on next run.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

dropIndexes();

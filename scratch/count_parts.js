const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const db = mongoose.connection.client.db('olaCarsFresh');
        
        console.log('\n--- Vehicle Status Counts ---');
        const vehicleStatusCounts = await db.collection('vehicles').aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]).toArray();
        console.log(JSON.stringify(vehicleStatusCounts, null, 2));

        console.log('\n--- Vehicle CreatedBy/Role Counts ---');
        const vehicleCreatorCounts = await db.collection('vehicles').aggregate([
            { $group: { _id: { createdBy: "$createdBy", creatorRole: "$creatorRole" }, count: { $sum: 1 } } }
        ]).toArray();
        console.log(JSON.stringify(vehicleCreatorCounts, null, 2));

        console.log('\n--- Vehicle Branch Counts ---');
        const vehicleBranchCounts = await db.collection('vehicles').aggregate([
            { $group: { _id: "$purchaseDetails.branch", count: { $sum: 1 } } }
        ]).toArray();
        console.log(JSON.stringify(vehicleBranchCounts, null, 2));

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();

const mongoose = require('mongoose');
require('dotenv').config();

const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/olacars';

async function checkVehicles() {
    try {
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB');

        const Vehicle = mongoose.model('Vehicle', new mongoose.Schema({
            status: String,
            isDeleted: Boolean,
            basicDetails: Object,
            purchaseDetails: Object
        }), 'vehicles');

        const availableVehicles = await Vehicle.find({
            status: 'ACTIVE — AVAILABLE',
            isDeleted: false
        });

        console.log(`Found ${availableVehicles.length} available vehicles:`);
        availableVehicles.forEach(v => {
            console.log(`- ${v.basicDetails?.make} ${v.basicDetails?.model} (VIN: ${v.basicDetails?.vin}, Branch: ${v.purchaseDetails?.branch})`);
        });

        const allVehicles = await Vehicle.find({});
        console.log(`Total vehicles in DB: ${allVehicles.length}`);
        
        const statusCounts = {};
        allVehicles.forEach(v => {
            statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
        });
        console.log('Status Counts:', statusCounts);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkVehicles();

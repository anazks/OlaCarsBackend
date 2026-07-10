const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI;
const Customer = require('../Src/modules/Customer/Model/CustomerModel');

async function test() {
    console.log('Connecting to Mongo...');
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB!');
        
        const total = await Customer.countDocuments({ isDeleted: false });
        console.log('Total active customers in DB:', total);
        
        // Let's test a date filter of last 30 days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        
        const query = {
            isDeleted: false,
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        };
        
        const countInDateRange = await Customer.countDocuments(query);
        console.log(`Customers registered in the last 30 days: ${countInDateRange}`);
        
        const samples = await Customer.find(query).limit(5).lean();
        console.log('Sample filtered customers:');
        samples.forEach(c => {
            console.log(`- Name: ${c.name}, CustomerId: ${c.customerId}, Registered: ${c.createdAt?.toISOString()}`);
        });
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

test();

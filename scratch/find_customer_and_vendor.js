const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function search() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        const db = mongoose.connection.db;

        const customers = await db.collection('customers').find({
            $or: [
                { displayName: { $regex: /JESSICA|SOTO|EU8783/i } },
                { companyName: { $regex: /JESSICA|SOTO|EU8783/i } },
                { firstName: { $regex: /JESSICA|SOTO|EU8783/i } },
                { lastName: { $regex: /JESSICA|SOTO|EU8783/i } }
            ]
        }).toArray();

        console.log('--- FOUND CUSTOMERS ---');
        customers.forEach(c => {
            console.log(`ID: ${c._id} | Name: ${c.displayName || c.companyName || (c.firstName + ' ' + c.lastName)} | Code/ID: ${c.customerCode || c._id}`);
        });

        const suppliers = await db.collection('suppliers').find({
            $or: [
                { vendorName: { $regex: /par/i } },
                { companyName: { $regex: /par/i } },
                { displayName: { $regex: /par/i } },
                { name: { $regex: /par/i } }
            ]
        }).toArray();

        console.log('--- FOUND SUPPLIERS/VENDORS ---');
        suppliers.forEach(s => {
            console.log(`ID: ${s._id} | Name: ${s.vendorName || s.companyName || s.displayName || s.name}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

search();

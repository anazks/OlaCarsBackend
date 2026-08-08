const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Driver/Model/DriverModel');

async function inspectDrivers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const Customer = mongoose.model('Customer');
        const Driver = mongoose.model('Driver');

        const searchTerms = ['JUAN MORAN', 'EW1781', 'ABDUL MAKDA'];

        console.log('=== SEARCHING DRIVERS ===');
        const drivers = await Driver.find({
            $or: searchTerms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { driverId: { $regex: term, $options: 'i' } }
                ]
            }))
        });
        console.log(`Found ${drivers.length} Driver documents:`);
        drivers.forEach(d => console.log({ _id: d._id, name: d.name, driverId: d.driverId, customer: d.customer }));

        console.log('\n=== SEARCHING CUSTOMERS ===');
        const customers = await Customer.find({
            $or: searchTerms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { customerId: { $regex: term, $options: 'i' } }
                ]
            }))
        }).populate('driver');
        console.log(`Found ${customers.length} Customer documents:`);
        customers.forEach(c => console.log({ _id: c._id, name: c.name, customerId: c.customerId, driver: c.driver ? { _id: c.driver._id, driverId: c.driver.driverId } : null }));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

inspectDrivers();

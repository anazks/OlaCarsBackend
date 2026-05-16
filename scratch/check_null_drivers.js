const mongoose = require('mongoose');
require('dotenv').config();
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
require('../Src/modules/Driver/Model/DriverModel');

async function checkNullDrivers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const invoices = await Invoice.find({ isDeleted: false }).lean();
        const withNullDriver = invoices.filter(inv => !inv.driver);
        
        console.log(`Total invoices: ${invoices.length}`);
        console.log(`Invoices with null/missing driver: ${withNullDriver.length}`);
        
        if (withNullDriver.length > 0) {
            console.log('Sample invoice IDs with null driver:', withNullDriver.slice(0, 5).map(i => i._id));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

checkNullDrivers();

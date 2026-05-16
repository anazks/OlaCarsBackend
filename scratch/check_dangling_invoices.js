const mongoose = require('mongoose');
require('dotenv').config();
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

async function checkDanglingInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const invoices = await Invoice.find({ isDeleted: false }).select('driver invoiceNumber').lean();
        console.log(`Checking ${invoices.length} invoices...`);
        
        const driverIds = [...new Set(invoices.map(inv => inv.driver).filter(id => !!id))];
        const existingDrivers = await Driver.find({ _id: { $in: driverIds } }).select('_id').lean();
        const existingDriverIdsSet = new Set(existingDrivers.map(d => d._id.toString()));

        const dangling = invoices.filter(inv => {
            if (!inv.driver) return true;
            return !existingDriverIdsSet.has(inv.driver.toString());
        });
        
        console.log(`Found ${dangling.length} dangling invoices.`);
        if (dangling.length > 0) {
            console.log('Sample dangling reasons:', dangling.slice(0, 5).map(inv => ({
                num: inv.invoiceNumber,
                driver: inv.driver
            })));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

checkDanglingInvoices();

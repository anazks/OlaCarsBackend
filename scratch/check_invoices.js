const mongoose = require('mongoose');
require('dotenv').config();
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
// Register other models for population
require('../Src/modules/Driver/Model/DriverModel');
require('../Src/modules/Vehicle/Model/VehicleModel');

async function checkInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const count = await Invoice.countDocuments({ isDeleted: false });
        console.log(`Total non-deleted invoices: ${count}`);

        if (count === 0) {
            console.log('No invoices found in database.');
        } else {
            const invoices = await Invoice.find({ isDeleted: false })
                .populate('driver', 'personalInfo.fullName')
                .limit(5)
                .sort({ createdAt: -1 });

            console.log(`Sample of last ${invoices.length} invoices:`);
            invoices.forEach(inv => {
                console.log(`- ${inv.invoiceNumber} | Driver: ${inv.driver?.personalInfo?.fullName || 'N/A'} | Status: ${inv.status} | Amount: ${inv.totalAmountDue}`);
            });
        }
    } catch (err) {
        console.error('Error checking invoices:', err);
    } finally {
        await mongoose.connection.close();
    }
}

checkInvoices();

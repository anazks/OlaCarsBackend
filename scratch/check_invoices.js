const mongoose = require('mongoose');
require('dotenv').config();
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function checkRecentInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        const invoices = await Invoice.find({ 
            createdAt: { $gte: tenMinutesAgo } 
        }).populate('driver', 'personalInfo.fullName');

        if (invoices.length === 0) {
            console.log('No invoices created in the last 10 minutes. Perform an assignment first!');
        } else {
            console.log(`Successfully found ${invoices.length} invoices created recently.`);
            const drivers = [...new Set(invoices.map(inv => inv.driver?.personalInfo?.fullName))];
            console.log(`Invoices generated for: ${drivers.join(', ')}`);
            
            // Show a sample invoice
            const sample = invoices[0];
            console.log('\n--- Sample Invoice Data ---');
            console.log(`Invoice #: ${sample.invoiceNumber}`);
            console.log(`Driver: ${sample.driver?.personalInfo?.fullName}`);
            console.log(`Amount: $${sample.totalAmountDue}`);
            console.log(`Status: ${sample.status}`);
            console.log(`Due Date: ${sample.dueDate.toDateString()}`);
        }
    } catch (err) {
        console.error('Error checking invoices:', err);
    } finally {
        await mongoose.connection.close();
    }
}

checkRecentInvoices();

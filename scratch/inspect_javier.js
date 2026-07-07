require('dotenv').config();
const mongoose = require('mongoose');

// Register schemas
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function inspectJavier() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const driver = await Driver.findOne({ "personalInfo.fullName": /JAVIER ARJONA/i });
        if (!driver) {
            console.log("Driver not found");
            return;
        }

        console.log(`Driver: ${driver.personalInfo.fullName}`);
        console.log(`rentTracking count: ${driver.rentTracking.length}`);
        
        console.log("First 10 installments in rentTracking:");
        driver.rentTracking.slice(0, 15).forEach((rt, idx) => {
            console.log(`  [${idx}] weekNumber: ${rt.weekNumber} (type: ${typeof rt.weekNumber}) | Label: "${rt.weekLabel}" | Due: ${rt.dueDate.toISOString().split('T')[0]}`);
        });

        const invoices = await Invoice.find({ driver: driver._id, invoiceType: 'RENTAL', isDeleted: false }).sort({ dueDate: 1 });
        console.log("\nInvoices for this driver:");
        invoices.forEach(inv => {
            console.log(`  Invoice ${inv.invoiceNumber} | WeekNumber: ${inv.weekNumber} (type: ${typeof inv.weekNumber}) | Label: "${inv.weekLabel}" | Due: ${inv.dueDate.toISOString().split('T')[0]}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

inspectJavier();

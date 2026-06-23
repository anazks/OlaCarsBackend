require('dotenv').config({path: '../.env'});
const mongoose = require('mongoose');

// Register all schemas in mongoose
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const Admin = require('../Src/modules/Admin/model/adminModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function inspectDriver() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const driver = await Driver.findOne({ driverId: "OLA-001257" });
        if (!driver) {
            console.log("Driver OLA-001257 not found.");
            return;
        }

        console.log(`\nDriver: ${driver.personalInfo?.fullName} (_id: ${driver._id})`);
        
        // Find all invoices for this driver
        const invoices = await Invoice.find({ driver: driver._id, isDeleted: false })
            .sort({ createdAt: 1 });
        
        console.log(`\nFound ${invoices.length} invoices for this driver:`);
        invoices.forEach(inv => {
            console.log(`- Invoice #${inv.invoiceNumber}, Week: ${inv.weekNumber}, Due: ${inv.dueDate?.toISOString()?.split('T')[0]}, Total Due: ${inv.totalAmountDue}, Status: ${inv.status}, CreatedBy: ${inv.createdBy}, CreatorRole: ${inv.creatorRole}, CreatedAt: ${inv.createdAt}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

inspectDriver();

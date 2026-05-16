const mongoose = require('mongoose');
require('dotenv').config();
const { ServiceBill } = require('../Src/modules/ServiceBill/Model/ServiceBillModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { generateWorkshopInvoiceNumber } = require('../Src/modules/Invoice/Repo/InvoiceRepo');

async function syncInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find approved driver-billed bills that don't have an invoice
        const bills = await ServiceBill.find({ isDriverBilled: true, status: 'APPROVED' }).populate('vehicleId');
        
        for (const bill of bills) {
            const existingInvoice = await Invoice.findOne({ serviceBill: bill._id });
            if (!existingInvoice) {
                console.log(`Syncing invoice for bill: ${bill.billNumber}`);
                
                if (!bill.vehicleId?.currentDriver) {
                    console.log(`Skipping bill ${bill.billNumber}: No current driver on vehicle.`);
                    continue;
                }

                const invoiceNumber = await generateWorkshopInvoiceNumber();
                const invoiceData = {
                    invoiceNumber,
                    invoiceType: "WORKSHOP",
                    driver: bill.vehicleId.currentDriver,
                    vehicle: bill.vehicleId._id,
                    serviceBill: bill._id,
                    dueDate: new Date(bill.approvedAt || Date.now()),
                    baseAmount: bill.totalAmount,
                    totalAmountDue: bill.totalAmount,
                    balance: bill.totalAmount,
                    status: "PENDING",
                    createdBy: bill.approvedBy || bill.createdBy,
                    creatorRole: bill.approvedByRole || bill.creatorRole
                };
                
                await Invoice.create(invoiceData);
                console.log(`Successfully generated invoice ${invoiceNumber} for bill ${bill.billNumber}`);
            } else {
                console.log(`Invoice already exists for bill ${bill.billNumber}: ${existingInvoice.invoiceNumber}`);
            }
        }
        
        console.log('Sync complete.');
        process.exit(0);
    } catch (err) {
        console.error('Sync failed:', err);
        process.exit(1);
    }
}

syncInvoices();

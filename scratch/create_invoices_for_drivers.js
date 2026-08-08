const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Driver/Model/DriverModel');
require('../Src/modules/Vehicle/Model/VehicleModel');
require('../Src/modules/Invoice/Model/InvoiceModel');
require('../Src/modules/Admin/model/adminModel');
require('../Src/modules/Tax/Model/TaxModel');

const InvoiceService = require('../Src/modules/Invoice/Service/InvoiceService');

async function createInvoicesForTargetDrivers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const Customer = mongoose.model('Customer');
        const Driver = mongoose.model('Driver');
        const Invoice = mongoose.model('Invoice');
        const Admin = mongoose.model('Admin');

        // Find active Admin for createdBy
        const adminDoc = await Admin.findOne({ role: 'ADMIN', isDeleted: false });
        const createdBy = adminDoc ? adminDoc._id : undefined;

        // Target drivers: JUAN MORAN (EW1781) and JESSICA SOTO (EU8783)
        const targetSearchTerms = ['JUAN MORAN', 'EW1781', 'JESSICA SOTO', 'EU8783'];

        console.log('Finding target drivers in database...');

        const customers = await Customer.find({
            isDeleted: { $ne: true },
            $or: targetSearchTerms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { customerId: { $regex: term, $options: 'i' } }
                ]
            }))
        }).populate({
            path: 'driver',
            populate: { path: 'currentVehicle' }
        });

        console.log(`Found ${customers.length} matching customer/driver profiles.\n`);

        for (const customer of customers) {
            const driver = customer.driver;
            if (!driver) {
                console.log(`⚠️ Customer ${customer.name} (${customer.customerId}) has no linked Driver model. Skipping.`);
                continue;
            }

            console.log(`==================================================`);
            console.log(`Processing Driver: ${driver.name} | Code: ${driver.driverId} | CustomerID: ${customer.customerId}`);

            // Find last RENTAL invoice
            const lastInvoice = await Invoice.findOne({
                driver: driver._id,
                invoiceType: 'RENTAL',
                isDeleted: false
            }).sort({ dueDate: -1, _id: -1 });

            let weekNumber = 1;
            if (lastInvoice && lastInvoice.weekNumber) {
                weekNumber = Number(lastInvoice.weekNumber) + 1;
            }

            const weeklyRent = Number(driver.weeklyRent || (driver.currentVehicle ? driver.currentVehicle.weeklyRent : 0) || 100);
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            const nextSeq = await InvoiceService.getNextInvoiceNumberVal();
            const invoiceNumber = InvoiceService.formatInvoiceNumber(nextSeq);

            const carryOver = (lastInvoice && lastInvoice.status !== 'PAID') ? Number(lastInvoice.balance || 0) : 0;
            const totalAmountDue = Math.round((weeklyRent + carryOver) * 100) / 100;

            const newInvoice = new Invoice({
                invoiceNumber,
                customer: customer._id,
                driver: driver._id,
                vehicle: driver.currentVehicle ? driver.currentVehicle._id : undefined,
                invoiceType: 'RENTAL',
                weekNumber,
                weekLabel: `Week ${weekNumber}`,
                dueDate,
                baseAmount: weeklyRent,
                carryOverAmount: carryOver,
                totalAmountDue,
                amountPaid: 0,
                balance: totalAmountDue,
                status: 'PENDING',
                lineItems: [
                    {
                        name: `Weekly Rental - Week ${weekNumber}`,
                        description: `Vehicle Rental Fee for ${driver.name} (${driver.currentVehicle ? driver.currentVehicle.vehicleNumber || 'Vehicle' : 'Lease'})`,
                        qty: 1,
                        unitPrice: weeklyRent,
                        total: weeklyRent
                    }
                ],
                subtotal: weeklyRent,
                taxAmount: 0,
                createdBy,
                creatorRole: 'ADMIN'
            });

            await newInvoice.save();

            console.log(`✅ Invoice Created Successfully!`);
            console.log(`   - Invoice Number: ${newInvoice.invoiceNumber}`);
            console.log(`   - Week Number:    Week ${newInvoice.weekNumber}`);
            console.log(`   - Driver Name:    ${driver.name} (${driver.driverId})`);
            console.log(`   - Base Rent:      $${newInvoice.baseAmount.toFixed(2)}`);
            console.log(`   - Total Due:      $${newInvoice.totalAmountDue.toFixed(2)}`);
            console.log(`   - Status:         ${newInvoice.status}`);
            console.log(`   - Due Date:       ${newInvoice.dueDate.toISOString().split('T')[0]}`);
            console.log(`==================================================\n`);
        }

    } catch (err) {
        console.error('Error creating invoices:', err);
    } finally {
        await mongoose.disconnect();
    }
}

createInvoicesForTargetDrivers();

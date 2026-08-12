const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Driver/Model/DriverModel');
require('../Src/modules/Invoice/Model/InvoiceModel');

async function verifyCreatedInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for Verification');

        const Invoice = mongoose.model('Invoice');

        const invNumbers = ['INV-669585', 'INV-669586', 'INV-669587'];
        const invoices = await Invoice.find({ invoiceNumber: { $in: invNumbers } })
            .populate('customer')
            .populate('driver');

        console.log('\n=== CREATED INVOICES VERIFICATION SUMMARY ===');
        invoices.forEach(inv => {
            console.log({
                invoiceNumber: inv.invoiceNumber,
                customerName: inv.customer ? inv.customer.name : 'N/A',
                customerId: inv.customer ? inv.customer.customerId : 'N/A',
                driverName: inv.driver ? inv.driver.name : (inv.customer ? inv.customer.name : 'N/A'),
                driverCode: inv.driver ? inv.driver.driverId : 'N/A',
                baseAmount: inv.baseAmount,
                totalAmountDue: inv.totalAmountDue,
                status: inv.status,
                dueDate: inv.dueDate.toISOString().split('T')[0]
            });
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

verifyCreatedInvoices();

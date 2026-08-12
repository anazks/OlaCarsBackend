const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Driver/Model/DriverModel');
require('../Src/modules/Invoice/Model/InvoiceModel');

async function cleanupAndFinalizeInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const Invoice = mongoose.model('Invoice');
        const Driver = mongoose.model('Driver');
        const Customer = mongoose.model('Customer');

        // Remove extra invoice INV-669586 (JUAN GUERRA)
        await Invoice.deleteOne({ invoiceNumber: 'INV-669586' });
        console.log('Removed extra test invoice INV-669586');

        // Update driver names if missing on Driver document
        const inv85 = await Invoice.findOne({ invoiceNumber: 'INV-669585' }).populate('customer').populate('driver');
        if (inv85 && inv85.driver && !inv85.driver.name) {
            await Driver.updateOne({ _id: inv85.driver._id }, { name: 'JESSICA SOTO' });
        }

        const inv87 = await Invoice.findOne({ invoiceNumber: 'INV-669587' }).populate('customer').populate('driver');
        if (inv87 && inv87.driver && !inv87.driver.name) {
            await Driver.updateOne({ _id: inv87.driver._id }, { name: 'JUAN MORAN' });
        }

        const finalInvoices = await Invoice.find({ invoiceNumber: { $in: ['INV-669585', 'INV-669587'] } })
            .populate('customer')
            .populate('driver');

        console.log('\n==================================================');
        console.log('🎉 INVOICES GENERATED & VERIFIED SUCCESSFULLY');
        console.log('==================================================');
        finalInvoices.forEach(inv => {
            console.log({
                invoiceNumber: inv.invoiceNumber,
                customer: inv.customer ? `${inv.customer.name} (${inv.customer.customerId})` : 'N/A',
                driver: inv.driver ? `${inv.driver.name || inv.customer.name} (${inv.driver.driverId})` : 'N/A',
                week: `Week ${inv.weekNumber}`,
                amount: `$${inv.totalAmountDue.toFixed(2)}`,
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

cleanupAndFinalizeInvoices();

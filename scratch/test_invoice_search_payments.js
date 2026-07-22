require('dotenv').config();
const mongoose = require('mongoose');
require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
require('../Src/modules/Customer/Model/CustomerModel');
require('../Src/modules/Driver/Model/DriverModel');
require('../Src/modules/Invoice/Model/InvoiceModel');

async function testSearch() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const PaymentReceived = mongoose.model('PaymentReceived');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

        // Find any payment received with invoices attached
        const samplePayment = await PaymentReceived.findOne({ "invoices.0": { $exists: true } });
        if (!samplePayment) {
            console.log('No payments with applied invoices found to test search.');
            process.exit(0);
        }

        const sampleInvNum = samplePayment.invoices[0].invoiceNumber;
        console.log('Testing search with sample invoice number:', sampleInvNum);

        const searchRegex = { $regex: sampleInvNum, $options: 'i' };

        const matchingInvoices = await Invoice.find({ invoiceNumber: searchRegex }).select('_id');
        const matchedInvoiceIds = matchingInvoices.map(inv => inv._id);

        const query = {
            $or: [
                { paymentNumber: searchRegex },
                { referenceNumber: searchRegex },
                { "invoices.invoiceNumber": searchRegex },
                { "invoices.invoiceId": { $in: matchedInvoiceIds } }
            ]
        };

        const results = await PaymentReceived.find(query);
        console.log(`Found ${results.length} payments matching search term "${sampleInvNum}":`);
        results.forEach(r => {
            console.log(`- Payment #${r.paymentNumber}, Applied Invoices: ${r.invoices.map(i => i.invoiceNumber).join(', ')}`);
        });

        await mongoose.disconnect();
        console.log('Done!');
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testSearch();

const mongoose = require('mongoose');
require('dotenv').config();
const { addPayment } = require('../Src/modules/ServiceBill/Service/ServiceBillService');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function testPartialPayment() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const billId = '6a0896ea64894ac3fb699cab'; // SB-202605-0012
        const user = { id: '6a0429abfbcf609e61d8406d', role: 'WORKSHOPSTAFF' };
        
        const paymentData = {
            amount: 10,
            paymentMethod: 'Cash',
            paidAt: new Date(),
            notes: 'Test partial payment'
        };

        const result = await addPayment(billId, paymentData, user);
        console.log('Payment Recorded. New Amount Paid:', result.amountPaid);
        console.log('Payment Status:', result.paymentStatus);
        
        const invoice = await Invoice.findOne({ serviceBill: billId });
        console.log('Linked Invoice:', invoice.invoiceNumber);
        console.log('Invoice Amount Paid:', invoice.amountPaid);
        console.log('Invoice Balance:', invoice.balance);
        console.log('Invoice Status:', invoice.status);

        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

testPartialPayment();

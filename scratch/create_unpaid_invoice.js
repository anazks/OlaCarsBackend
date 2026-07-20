const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        // 1. Find Customer JESSICA SOTO EU8783
        const customer = await Customer.findOne({
            name: { $regex: /jessica soto/i },
            isDeleted: false
        });

        if (!customer) {
            console.error("Customer JESSICA SOTO EU8783 not found!");
            process.exit(1);
        }

        console.log(`Found Customer: Name="${customer.name}", ID=${customer._id}`);

        // 2. Generate a unique invoice number
        const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
        let newNum = 10005;
        if (lastInvoice && lastInvoice.invoiceNumber) {
            const match = lastInvoice.invoiceNumber.match(/\d+/);
            if (match) {
                newNum = parseInt(match[0], 10) + 1;
            }
        }
        const invoiceNumber = `INV-${newNum}`;

        // 3. Create the Invoice
        const baseAmount = 100.00;
        const invoiceData = {
            invoiceNumber,
            invoiceType: "MANUAL",
            customer: customer._id,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            baseAmount,
            totalAmountDue: baseAmount,
            amountPaid: 0,
            balance: baseAmount,
            status: "PENDING",
            lineItems: [{
                name: "Rent payment",
                qty: 1,
                unitPrice: baseAmount,
                total: baseAmount
            }],
            subtotal: baseAmount,
            isDeleted: false,
            creatorRole: "ADMIN"
        };

        const newInvoice = new Invoice(invoiceData);
        await newInvoice.save();

        console.log(`Successfully created unpaid invoice:`);
        console.log(`Invoice Number: ${newInvoice.invoiceNumber}`);
        console.log(`Customer: ${customer.name}`);
        console.log(`Amount: $${newInvoice.totalAmountDue}`);
        console.log(`Status: ${newInvoice.status}`);
        console.log(`Due Date: ${newInvoice.dueDate}`);

        process.exit(0);
    } catch (error) {
        console.error("Error creating unpaid invoice:", error);
        process.exit(1);
    }
}

run();

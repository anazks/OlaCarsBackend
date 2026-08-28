require("dotenv").config();
const mongoose = require("mongoose");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    // 1. Search for any invoice matching 3133 or INV-003133 (including isDeleted: true or false)
    const invDirect = await Invoice.find({ invoiceNumber: /3133/i });
    console.log("Invoices matching 3133 in invoiceNumber:", invDirect.map(i => ({ _id: i._id, invoiceNumber: i.invoiceNumber, isDeleted: i.isDeleted, customer: i.customer, weekNumber: i.weekNumber, invoiceType: i.invoiceType, lineItems: i.lineItems })));

    // 2. Count total invoices
    const totalCount = await Invoice.countDocuments({});
    console.log("Total invoices in DB (all):", totalCount);
    const activeCount = await Invoice.countDocuments({ isDeleted: false });
    console.log("Active invoices (isDeleted: false):", activeCount);

    // 3. Last 10 invoices
    const lastInvoices = await Invoice.find({}).sort({ createdAt: -1 }).limit(10);
    console.log("Recent 10 invoices:", lastInvoices.map(i => ({ _id: i._id, invoiceNumber: i.invoiceNumber, isDeleted: i.isDeleted, customer: i.customer, weekNumber: i.weekNumber, invoiceType: i.invoiceType, lineItems: i.lineItems?.map(li => li.name) })));

    // 4. Any invoice with item "Weekly Rent"
    const rentInvoices = await Invoice.find({ "lineItems.name": /Weekly Rent/i });
    console.log("Invoices with 'Weekly Rent' line item count:", rentInvoices.length);
    if (rentInvoices.length > 0) {
        console.log("Sample rental invoices:", rentInvoices.slice(0, 5).map(i => ({ invoiceNumber: i.invoiceNumber, isDeleted: i.isDeleted, customer: i.customer, weekNumber: i.weekNumber, lineItems: i.lineItems.map(l => l.name) })));
    }

    await mongoose.disconnect();
}

check().catch(console.error);

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const Bill = require('../Src/modules/Bill/Model/BillModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const Supplier = require('../Src/modules/Supplier/Model/SupplierModel');
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const Driver = require('../Src/modules/Driver/Model/DriverModel');

async function createInvoiceAndBill() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB\n");

        let branch = await Branch.findOne({ isDeleted: { $ne: true } });
        if (!branch) {
            branch = await Branch.create({ name: "Main Branch", code: "MB01" });
        }

        // 1. Find Customer for JUAN MORAN EW1781
        let customer = await Customer.findOne({ name: /JUAN MORAN/i, isDeleted: false });
        if (!customer) {
            const driver = await Driver.findOne({ name: /JUAN MORAN/i, isDeleted: false });
            if (driver) {
                customer = await Customer.findOne({ driver: driver._id, isDeleted: false });
            }
        }
        if (!customer) {
            customer = await Customer.findOne({ isDeleted: false });
        }

        // 2. Find Supplier for TEST VENDOR AUTO SETOFF
        let supplier = await Supplier.findOne({ $or: [{ name: /TEST VENDOR/i }, { companyName: /TEST VENDOR/i }], isDeleted: false });
        if (!supplier) {
            supplier = await Supplier.create({
                name: "TEST VENDOR AUTO SETOFF",
                companyName: "TEST VENDOR AUTO SETOFF",
                email: "testvendor@olacars.com",
                status: "ACTIVE"
            });
        }

        console.log(`Target Customer: ${customer ? customer.name : 'None'} (${customer ? customer._id : 'N/A'})`);
        console.log(`Target Supplier: ${supplier ? (supplier.name || supplier.companyName) : 'None'} (${supplier ? supplier._id : 'N/A'})\n`);

        const randomCode = Math.floor(100000 + Math.random() * 900000);

        // Create Invoice
        let createdInvoice = null;
        if (customer) {
            createdInvoice = await Invoice.create({
                invoiceNumber: `INV-${randomCode}`,
                customer: customer._id,
                driver: customer.driver,
                branch: branch._id,
                baseAmount: 150.00,
                subtotal: 150.00,
                totalAmount: 150.00,
                totalAmountDue: 150.00,
                amountPaid: 0,
                balance: 150.00,
                balanceDue: 150.00,
                weekNumber: Math.floor(Math.random() * 52) + 1,
                status: "PENDING",
                dueDate: new Date(Date.now() + 7 * 86400000),
                invoiceDate: new Date(),
                invoiceType: "RENTAL",
                createdBy: "6a2290019fa01283dd165204",
                creatorRole: "ADMIN"
            });
            console.log(`✓ Invoice Created: #${createdInvoice.invoiceNumber} ($150.00) for Customer ${customer.name}`);
        }

        // Create Bill
        let createdBill = null;
        if (supplier) {
            createdBill = await Bill.create({
                billNumber: `BILL-${randomCode}`,
                supplier: supplier._id,
                supplierName: supplier.name || supplier.companyName,
                branch: branch._id,
                totalAmount: 200.00,
                amountPaid: 0,
                balanceDue: 200.00,
                status: "OPEN",
                dueDate: new Date(Date.now() + 14 * 86400000),
                billDate: new Date(),
                createdBy: "6a2290019fa01283dd165204",
                creatorRole: "ADMIN"
            });
            console.log(`✓ Bill Created: #${createdBill.billNumber} ($200.00) for Vendor ${supplier.name || supplier.companyName}`);
        }

        console.log("\nFinished successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error creating invoice and bill:", err);
        process.exit(1);
    }
}

createInvoiceAndBill();

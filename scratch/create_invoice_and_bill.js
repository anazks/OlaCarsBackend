const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const customerId = '6a2835564c85b0bddca65d1f'; // JESSICA SOTO EU8783
const supplierId = '6a2814ee202b72c0a4a88124'; // PARKING SOLUTIONS S,A

async function createInvoiceAndBill() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        const db = mongoose.connection.db;

        // Get a valid branch
        const branch = await db.collection('branches').findOne({});
        const branchId = branch ? branch._id : new mongoose.Types.ObjectId();

        // Get an expense accounting code (e.g. 5.1.01 or similar)
        let expenseCode = await db.collection('accountingcodes').findOne({ category: 'EXPENSE' });
        if (!expenseCode) {
            expenseCode = await db.collection('accountingcodes').findOne({});
        }
        const expenseAccountId = expenseCode ? expenseCode._id : new mongoose.Types.ObjectId();

        // Get an admin user ID for createdBy
        const admin = await db.collection('admins').findOne({});
        const adminId = admin ? admin._id : new mongoose.Types.ObjectId();

        // 1. Create Invoice
        const timestamp = Date.now();
        const invoiceNum = `INV-${timestamp.toString().slice(-6)}`;
        const invoiceDoc = {
            invoiceNumber: invoiceNum,
            invoiceType: 'MANUAL',
            customer: new mongoose.Types.ObjectId(customerId),
            branch: branchId,
            items: [
                {
                    name: 'Standard Services / Spare Parts',
                    description: 'Test Invoice for Jessica Soto',
                    qty: 1,
                    unitPrice: 100.00,
                    total: 100.00
                }
            ],
            subtotal: 100.00,
            taxTotal: 0,
            totalAmount: 100.00,
            amountPaid: 0,
            balanceDue: 100.00,
            status: 'UNPAID',
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdBy: adminId,
            creatorRole: 'ADMIN',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const invResult = await db.collection('invoices').insertOne(invoiceDoc);
        console.log(`Successfully created Invoice #${invoiceNum} (ID: ${invResult.insertedId}) for Jessica Soto ($100.00)`);

        // 2. Create Bill
        const billNum = `BILL-${timestamp.toString().slice(-6)}`;
        const billDoc = {
            billNumber: billNum,
            supplier: new mongoose.Types.ObjectId(supplierId),
            branch: branchId,
            billDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            items: [
                {
                    itemName: 'Parking & Logistics Services',
                    quantity: 1,
                    unitPrice: 100.00,
                    accountId: expenseAccountId,
                    description: 'Test Vendor Bill for Parking Solutions S,A'
                }
            ],
            totalAmount: 100.00,
            amountPaid: 0,
            amountDue: 100.00,
            status: 'UNPAID',
            createdBy: adminId,
            creatorRole: 'ADMIN',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const billResult = await db.collection('bills').insertOne(billDoc);
        console.log(`Successfully created Bill #${billNum} (ID: ${billResult.insertedId}) for PARKING SOLUTIONS S,A ($100.00)`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

createInvoiceAndBill();

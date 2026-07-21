const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

        const customers = await Customer.find({
            $or: [
                { name: new RegExp("JUAN MORAN", "i") },
                { firstName: new RegExp("JUAN MORAN", "i") },
                { lastName: new RegExp("EW1781", "i") }
            ]
        });

        console.log(`Found ${customers.length} customer(s) for JUAN MORAN:`);
        for (const c of customers) {
            console.log(`- Customer ID: ${c._id}, Name: "${c.name}"`);

            const invs = await Invoice.find({ customer: c._id, isDeleted: { $ne: true } });
            console.log(`  Found ${invs.length} total invoice(s) for ${c.name}:`);
            for (const inv of invs) {
                const invBal = inv.balance !== undefined ? inv.balance : (inv.totalAmountDue - (inv.amountPaid || 0));
                console.log(`    Invoice #${inv.invoiceNumber} | Total: $${inv.totalAmountDue} | Paid: $${inv.amountPaid || 0} | Balance: $${invBal} | Status: ${inv.status} | Due Date: ${inv.dueDate}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

const mongoose = require("mongoose");
require("dotenv").config();

async function createInvoices() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/olacars");
        console.log("Connected to MongoDB.");

        const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
        const Customer = require("../Src/modules/Customer/Model/CustomerModel");
        const Branch = require("../Src/modules/Branch/Model/BranchModel");

        let branch = await Branch.findOne({ isDeleted: { $ne: true } });
        if (!branch) {
            branch = await Branch.create({ name: "Main Branch", code: "MB01" });
        }

        const customerAId = "6a5f0f7768b4cd2a4c4b161e";
        const customerBId = "6a5f0f6b5e4c762ae6dc150d";

        let customerA = await Customer.findById(customerAId);
        if (!customerA) {
            customerA = await Customer.findOne({ name: /Test Customer A/i });
        }

        let customerB = await Customer.findById(customerBId);
        if (!customerB) {
            customerB = await Customer.findOne({ name: /Test Customer B/i });
        }

        if (!customerA || !customerB) {
            console.error("Customers not found in DB.");
            process.exit(1);
        }

        console.log(`\nCreating 2 open invoices for Customer A (${customerA.name})...`);
        const invA1 = await Invoice.create({
            invoiceNumber: `INV-A1-${Date.now()}`,
            customer: customerA._id,
            branch: branch._id,
            baseAmount: 200,
            subtotal: 200,
            totalAmountDue: 200,
            amountPaid: 0,
            balance: 200,
            weekNumber: 1,
            status: "PENDING",
            dueDate: new Date(Date.now() + 7 * 86400000),
            invoiceDate: new Date(),
            invoiceType: "RENTAL",
            createdBy: "6a2290019fa01283dd165204",
            creatorRole: "ADMIN"
        });

        const invA2 = await Invoice.create({
            invoiceNumber: `INV-A2-${Date.now() + 1}`,
            customer: customerA._id,
            branch: branch._id,
            baseAmount: 200,
            subtotal: 200,
            totalAmountDue: 200,
            amountPaid: 0,
            balance: 200,
            weekNumber: 2,
            status: "PENDING",
            dueDate: new Date(Date.now() + 14 * 86400000),
            invoiceDate: new Date(),
            invoiceType: "RENTAL",
            createdBy: "6a2290019fa01283dd165204",
            creatorRole: "ADMIN"
        });

        console.log(`  ✓ Created Invoice #${invA1.invoiceNumber} ($200)`);
        console.log(`  ✓ Created Invoice #${invA2.invoiceNumber} ($200)`);

        console.log(`\nCreating 2 open invoices for Customer B (${customerB.name})...`);
        const invB1 = await Invoice.create({
            invoiceNumber: `INV-B1-${Date.now() + 2}`,
            customer: customerB._id,
            branch: branch._id,
            baseAmount: 200,
            subtotal: 200,
            totalAmountDue: 200,
            amountPaid: 0,
            balance: 200,
            weekNumber: 1,
            status: "PENDING",
            dueDate: new Date(Date.now() + 7 * 86400000),
            invoiceDate: new Date(),
            invoiceType: "RENTAL",
            createdBy: "6a2290019fa01283dd165204",
            creatorRole: "ADMIN"
        });

        const invB2 = await Invoice.create({
            invoiceNumber: `INV-B2-${Date.now() + 3}`,
            customer: customerB._id,
            branch: branch._id,
            baseAmount: 200,
            subtotal: 200,
            totalAmountDue: 200,
            amountPaid: 0,
            balance: 200,
            weekNumber: 2,
            status: "PENDING",
            dueDate: new Date(Date.now() + 14 * 86400000),
            invoiceDate: new Date(),
            invoiceType: "RENTAL",
            createdBy: "6a2290019fa01283dd165204",
            creatorRole: "ADMIN"
        });

        console.log(`  ✓ Created Invoice #${invB1.invoiceNumber} ($200)`);
        console.log(`  ✓ Created Invoice #${invB2.invoiceNumber} ($200)`);

        console.log("\n✅ All 4 Invoices Created Successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to create invoices:", err);
        process.exit(1);
    }
}

createInvoices();

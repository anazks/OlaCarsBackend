require("dotenv").config();
const mongoose = require("mongoose");

// Load Models
const Customer = require("./Src/modules/Customer/Model/CustomerModel");
const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");

async function createInvoice() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsFresh?appName=Cluster0";
        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("✓ Connected to MongoDB.");

        const targetCustomerName = "Test Customer A 1784614775174";
        
        // Search by exact name, customerId, or regex match
        let customer = await Customer.findOne({
            $or: [
                { name: targetCustomerName },
                { name: { $regex: /Test Customer B 1784614775246/i } },
                { customerId: { $regex: /1784614775246/ } },
                { phone: { $regex: /1784614775246/ } }
            ],
            isDeleted: false
        });

        if (!customer) {
            console.log(`Customer matching "${targetCustomerName}" not found. Creating customer...`);
            customer = await Customer.create({
                name: targetCustomerName,
                email: "testcustomerB@example.com",
                phone: "+1784614775246",
                address: "456 Test Avenue",
                status: "ACTIVE"
            });
            console.log(`✓ Created new Customer: ${customer.name} (${customer._id})`);
        } else {
            console.log(`✓ Found Customer: ${customer.name} (ID: ${customer._id})`);
        }

        // Generate unique invoice number
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV-TEST-${Date.now().toString().slice(-6)}-${randomNum}`;
        const amount = 100.00;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const newInvoice = await Invoice.create({
            invoiceNumber,
            invoiceType: "MANUAL",
            customer: customer._id,
            dueDate,
            baseAmount: amount,
            carryOverAmount: 0,
            totalAmountDue: amount,
            amountPaid: 0,
            balance: amount,
            status: "PENDING",
            lineItems: [
                {
                    name: "Service & Maintenance",
                    description: "Manual invoice test item",
                    qty: 1,
                    unitPrice: amount,
                    total: amount
                }
            ],
            generatedAt: new Date()
        });

        console.log("\n=======================================================");
        console.log("✓ INVOICE CREATED SUCCESSFULLY!");
        console.log("=======================================================");
        console.log(`• Invoice ID:     ${newInvoice._id}`);
        console.log(`• Invoice Number: ${newInvoice.invoiceNumber}`);
        console.log(`• Customer:       ${customer.name} (${customer._id})`);
        console.log(`• Amount Due:     $${newInvoice.totalAmountDue.toFixed(2)}`);
        console.log(`• Balance:        $${newInvoice.balance.toFixed(2)}`);
        console.log(`• Status:         ${newInvoice.status}`);
        console.log(`• Due Date:       ${newInvoice.dueDate.toISOString().split('T')[0]}`);
        console.log("=======================================================\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating invoice:", error);
        process.exit(1);
    }
}

createInvoice();

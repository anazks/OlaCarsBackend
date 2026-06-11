/**
 * Quick debug script to test invoice creation from a service bill approval.
 * Run: node test_invoice_debug.js
 */
const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
    console.log("Connected to MongoDB");

    const Customer = require("./Src/modules/Customer/Model/CustomerModel");

    // Check if the hardcoded customer exists
    const defaultCustId = "6a23e38bfec1624c663ce61c";
    console.log("\n--- Checking default customer ID:", defaultCustId, "---");
    
    try {
        const cust = await Customer.findById(defaultCustId);
        console.log("Customer found:", cust ? cust.name : "NULL — DOES NOT EXIST!");
    } catch (err) {
        console.log("Error looking up customer:", err.message);
    }

    // List all customers
    console.log("\n--- All customers ---");
    const allCustomers = await Customer.find({ status: "ACTIVE" }).limit(5).lean();
    for (const c of allCustomers) {
        console.log(`  _id: ${c._id}, name: ${c.name}, customerId: ${c.customerId}, driver: ${c.driver}`);
    }

    // Check for any DRAFT service bills
    const { ServiceBill } = require("./Src/modules/ServiceBill/Model/ServiceBillModel");
    console.log("\n--- Recent service bills ---");
    const recentBills = await ServiceBill.find().sort({ createdAt: -1 }).limit(5).lean();
    for (const b of recentBills) {
        console.log(`  _id: ${b._id}, billNumber: ${b.billNumber}, status: ${b.status}, isDriverBilled: ${b.isDriverBilled}`);
    }

    // Check for any workshop invoices
    const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");
    console.log("\n--- Workshop invoices ---");
    const wsInvoices = await Invoice.find({ invoiceType: "WORKSHOP" }).sort({ createdAt: -1 }).limit(5).lean();
    if (wsInvoices.length === 0) {
        console.log("  No workshop invoices found!");
    } else {
        for (const inv of wsInvoices) {
            console.log(`  _id: ${inv._id}, invoiceNumber: ${inv.invoiceNumber}, status: ${inv.status}, customer: ${inv.customer}, driver: ${inv.driver}`);
        }
    }

    // Try creating an invoice manually to see what error occurs
    if (recentBills.length > 0 && allCustomers.length > 0) {
        console.log("\n--- Attempting manual invoice creation ---");
        const bill = recentBills[0];
        const cust = allCustomers[0];
        try {
            const invoiceData = {
                invoiceNumber: `TEST-DEBUG-${Date.now()}`,
                invoiceType: "WORKSHOP",
                customer: cust._id,
                vehicle: bill.vehicleId,
                serviceBill: bill._id,
                dueDate: new Date(Date.now() + 86400000),
                lineItems: [],
                subtotal: bill.subtotal || 0,
                baseAmount: bill.totalAmount || 0,
                totalAmountDue: bill.totalAmount || 0,
                balance: bill.totalAmount || 0,
                status: "PENDING",
                createdBy: bill.createdBy,
                creatorRole: bill.creatorRole
            };
            console.log("  Invoice data:", JSON.stringify(invoiceData, null, 2));
            const result = await Invoice.create(invoiceData);
            console.log("  SUCCESS! Invoice created:", result.invoiceNumber);
            // Clean up test invoice
            await Invoice.deleteOne({ _id: result._id });
            console.log("  (Test invoice cleaned up)");
        } catch (err) {
            console.log("  FAILED to create invoice:", err.message);
            if (err.errors) {
                for (const [field, error] of Object.entries(err.errors)) {
                    console.log(`    Field '${field}': ${error.message}`);
                }
            }
        }
    }

    await mongoose.disconnect();
    console.log("\nDone.");
}

run().catch(err => { console.error(err); process.exit(1); });

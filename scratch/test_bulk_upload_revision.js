const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load backend env
dotenv.config({ path: path.join(__dirname, "../.env") });

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const Tax = require("../Src/modules/Tax/Model/TaxModel");
const InvoiceService = require("../Src/modules/Invoice/Service/InvoiceService");

async function runTest() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // 1. Resolve a branch (must exist for Customer creation)
        let branch = await Branch.findOne({ isDeleted: false, status: "ACTIVE" });
        if (!branch) {
            console.log("No active branch found, creating a dummy branch...");
            branch = await Branch.create({
                name: "Test Branch " + Date.now(),
                code: "TB-" + Math.floor(Math.random() * 100),
                status: "ACTIVE"
            });
        }
        console.log("Using Branch:", branch.name, branch._id);

        // 2. Resolve active tax
        let tax = await Tax.findOne({ isActive: true, isDeleted: false });
        if (!tax) {
            console.log("No active tax found, creating a dummy tax...");
            tax = await Tax.create({
                name: "ITBMS",
                rate: 7,
                isActive: true
            });
        }
        console.log("Using Tax:", tax.name, tax.rate + "%");

        // Mock unique invoice number for this test
        const testInvoiceNumber = "MOCK-INV-" + Math.floor(10000 + Math.random() * 90000);
        console.log("Will upload items under invoice number:", testInvoiceNumber);

        // Define mock rows
        // Note the repeated invoice number with different items
        const mockRows = [
            {
                "Invoice Date": "2026-06-10",
                "Invoice ID": "ID-" + testInvoiceNumber,
                "Invoice Number": testInvoiceNumber,
                "Invoice Status": "Pending",
                "Customer ID": "CUST-MOCK-" + Date.now(),
                "Customer Name": "Legacy Customer BulkTest",
                "Customer Number": "+1234567890",
                "Is Inclusive Tax": "FALSE",
                "Due Date": "2026-06-25",
                "SubTotal": "300",
                "Total": "321", // 300 subtotal + 7% tax = 321
                "Balance": "321",
                "Notes": "Original invoice memo",
                "Terms & Conditions": "Strict 15 day payment terms apply.",
                "Location Name": branch.name,
                "Item Name": "Premium Car Service",
                "Item Desc": "Engine oil filter and checkup",
                "Quantity": "1",
                "Item Price": "200",
                "Item Total": "200",
                "Item Tax %": "7",
                "Item Tax Amount": "14"
            },
            {
                "Invoice Number": testInvoiceNumber,
                "Item Name": "Coolant Flush",
                "Item Desc": "Flush and refill coolant",
                "Quantity": "2",
                "Item Price": "50",
                "Item Total": "100",
                "Item Tax %": "7",
                "Item Tax Amount": "7"
            }
        ];

        console.log("\nTriggering bulk upload service...");
        const result = await InvoiceService.bulkUploadInvoices(
            mockRows,
            "WORKSHOP",
            new mongoose.Types.ObjectId(), // Dummy userId
            "ADMIN" // Dummy role
        );

        console.log("\n--- Upload Result ---");
        console.log(JSON.stringify(result, null, 2));

        // 3. Query the newly created invoice to verify its state
        console.log("\nRetrieving created invoice from database...");
        const createdInv = await Invoice.findOne({ invoiceNumber: testInvoiceNumber })
            .populate("customer")
            .populate("tax");

        if (!createdInv) {
            throw new Error("Invoice was not created in the database!");
        }

        console.log("\n--- Created Invoice Details ---");
        console.log("Invoice Number:", createdInv.invoiceNumber);
        console.log("Invoice Type:", createdInv.invoiceType);
        console.log("Customer (Linked):", createdInv.customer ? `${createdInv.customer.name} (${createdInv.customer.customerId})` : "MISSING!");
        console.log("Terms & Conditions:", createdInv.terms);
        console.log("Notes / Memo:", createdInv.notes);
        console.log("Subtotal:", createdInv.subtotal);
        console.log("Tax Amount:", createdInv.taxAmount);
        console.log("Total Amount Due:", createdInv.totalAmountDue);
        console.log("Balance:", createdInv.balance);
        console.log("Status:", createdInv.status);
        console.log("Line Items Count:", createdInv.lineItems.length);
        
        console.log("\nLine Items:");
        createdInv.lineItems.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.name} | Qty: ${item.qty} | Price: ${item.unitPrice} | Total: ${item.total} | Tax Rate: ${item.taxRate}% | Tax Amount: ${item.taxAmount}`);
        });

        // 4. Assertions/Verifications
        let failed = false;
        if (!createdInv.customer) {
            console.error("❌ FAIL: Customer link is missing.");
            failed = true;
        } else if (createdInv.customer.name !== "Legacy Customer BulkTest") {
            console.error("❌ FAIL: Customer name does not match.");
            failed = true;
        }

        if (createdInv.terms !== "Strict 15 day payment terms apply.") {
            console.error("❌ FAIL: Terms & Conditions was not set correctly.");
            failed = true;
        }

        if (createdInv.lineItems.length !== 2) {
            console.error(`❌ FAIL: Expected 2 line items, but got ${createdInv.lineItems.length}`);
            failed = true;
        }

        if (createdInv.subtotal !== 300) {
            console.error(`❌ FAIL: Expected subtotal 300, but got ${createdInv.subtotal}`);
            failed = true;
        }

        if (createdInv.taxAmount !== 21) {
            console.error(`❌ FAIL: Expected tax amount 21, but got ${createdInv.taxAmount}`);
            failed = true;
        }

        if (createdInv.totalAmountDue !== 321) {
            console.error(`❌ FAIL: Expected total 321, but got ${createdInv.totalAmountDue}`);
            failed = true;
        }

        if (!failed) {
            console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");
        } else {
            console.log("\n❌ SOME TESTS FAILED.");
        }

    } catch (err) {
        console.error("Error running test:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

runTest();

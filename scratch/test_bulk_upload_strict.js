const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load backend env
dotenv.config({ path: path.join(__dirname, "../.env") });

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const Tax = require("../Src/modules/Tax/Model/TaxModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const PaymentReceived = require("../Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const InvoiceService = require("../Src/modules/Invoice/Service/InvoiceService");

async function runTest() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // 1. Resolve a branch (must exist for Customer)
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

        // 3. Ensure a test customer exists strictly matching "ERICK VILLAVERDE"
        let customer = await Customer.findOne({ name: "ERICK VILLAVERDE", isDeleted: false });
        if (!customer) {
            console.log("Creating test customer ERICK VILLAVERDE...");
            customer = await Customer.create({
                name: "ERICK VILLAVERDE",
                customerId: "CUST-000001",
                customerNumber: "CUS-00002",
                branch: branch._id,
                status: "ACTIVE"
            });
        }
        console.log("Using Customer:", customer.name, customer.customerId);

        // Mock unique invoice number for this test
        const testInvoiceNumber = "MOCK-INV-STRICT-" + Math.floor(10000 + Math.random() * 90000);
        console.log("Will upload items under invoice number:", testInvoiceNumber);

        // Define mock rows grouped under the same invoice
        const mockRows = [
            {
                "Invoice Date": "2026-06-10",
                "Invoice ID": "ID-" + testInvoiceNumber,
                "Invoice Number": testInvoiceNumber,
                "Invoice Status": "Paid", // Test Paid invoice to see if it generates ledger / payment entries
                "Customer Name": "ERICK VILLAVERDE",
                "Is Inclusive Tax": "FALSE",
                "Due Date": "2026-06-25",
                "SubTotal": "300",
                "Total": "321", // 300 subtotal + 7% tax = 321
                "Balance": "0",
                "Notes": "Strict verification memo",
                "Terms & Conditions": "Strict 15 day payment terms apply.",
                "Location Name": branch.name,
                "Item Name": "Engine Repair",
                "Item Desc": "Workshop repairs",
                "Quantity": "1",
                "Item Price": "200",
                "Item Total": "200",
                "Item Tax %": "7",
                "Item Tax Amount": "14"
            },
            {
                "Invoice Number": testInvoiceNumber,
                "Item Name": "Brake pad check",
                "Item Desc": "Workshop check",
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

        // 4. Query the newly created invoice to verify its state
        console.log("\nRetrieving created invoice from database...");
        const createdInv = await Invoice.findOne({ invoiceNumber: testInvoiceNumber })
            .populate("customer")
            .populate("tax");

        if (!createdInv) {
            throw new Error("Invoice was not created in the database!");
        }

        console.log("\n--- Created Invoice Details ---");
        console.log("Invoice Number:", createdInv.invoiceNumber);
        console.log("Customer (Linked):", createdInv.customer ? `${createdInv.customer.name} (${createdInv.customer.customerId})` : "MISSING!");
        console.log("Terms & Conditions:", createdInv.terms);
        console.log("Subtotal:", createdInv.subtotal);
        console.log("Tax Amount:", createdInv.taxAmount);
        console.log("Total Amount Due:", createdInv.totalAmountDue);
        console.log("Status:", createdInv.status);
        console.log("Line Items Count:", createdInv.lineItems.length);

        // 5. Verify Ledger and Payment Received entries
        const ledgerEntriesCount = await LedgerEntry.countDocuments({ referenceId: createdInv._id });
        const paymentReceivedCount = await PaymentReceived.countDocuments({ "invoices.invoiceId": createdInv._id });

        console.log("\n--- Ledger / Payment Verification ---");
        console.log("Ledger Entries Count (Expected: 0):", ledgerEntriesCount);
        console.log("Payment Received Count (Expected: 0):", paymentReceivedCount);

        let failed = false;
        if (!createdInv.customer || createdInv.customer.name !== "ERICK VILLAVERDE") {
            console.error("❌ FAIL: Customer was not matched correctly by Name.");
            failed = true;
        }
        if (createdInv.lineItems.length !== 2) {
            console.error(`❌ FAIL: Expected 2 line items, but got ${createdInv.lineItems.length}`);
            failed = true;
        }
        if (ledgerEntriesCount !== 0) {
            console.error(`❌ FAIL: Ledger entries were created (${ledgerEntriesCount}) but they should be bypassed.`);
            failed = true;
        }
        if (paymentReceivedCount !== 0) {
            console.error(`❌ FAIL: PaymentReceived records were created (${paymentReceivedCount}) but they should be bypassed.`);
            failed = true;
        }

        if (!failed) {
            console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY! Customer name strict matching, item grouping, and ledger exclusion work perfectly!");
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

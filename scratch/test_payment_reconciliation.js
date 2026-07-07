require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");

// Import Models
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const PaymentReceived = require("../Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const PaymentTransaction = require("../Src/modules/Payment/Model/PaymentTransactionModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const Admin = require("../Src/modules/Admin/model/adminModel");
const PaymentImportService = require("../Src/modules/PaymentReceived/Service/PaymentImportService");

async function runTest() {
    console.log("Connecting to database...");
    await connectDB();

    console.log("Initializing test sandbox environment...");
    
    // Resolve or create Admin user
    let testAdmin = await Admin.findOne({ email: "test.admin@reconciliation.com" });
    if (!testAdmin) {
        testAdmin = await Admin.findOne({});
    }
    if (!testAdmin) {
        testAdmin = await Admin.create({
            fullName: "Test Admin",
            email: "test.admin@reconciliation.com",
            passwordHash: "$2a$12$dummyhashedpasswordfordevelopmentpurposesonly",
            role: "ADMIN",
            status: "ACTIVE"
        });
        console.log("Created dummy test admin:", testAdmin._id);
    } else {
        console.log("Using existing admin:", testAdmin.email);
    }

    // 1. Resolve or Create Branch
    let testBranch = await Branch.findOne({ name: "Test Branch" });
    if (!testBranch) {
        testBranch = await Branch.create({
            name: "Test Branch",
            code: "BR-TEST",
            status: "ACTIVE"
        });
        console.log("Created Test Branch:", testBranch._id);
    }

    // 2. Resolve or Create Accounting Code (Cash / Bank Account)
    let testAccCode = await AccountingCode.findOne({ code: "1020" });
    if (!testAccCode) {
        testAccCode = await AccountingCode.create({
            code: "1020",
            name: "Cash Account",
            category: "ASSET",
            type: "DEBIT",
            isActive: true,
            createdBy: testAdmin._id,
            creatorRole: "ADMIN"
        });
        console.log("Created Accounting Code:", testAccCode.code);
    }
    
    // Ensure Accounts Receivable and Advance Received exist for double-entry auto ledger test
    let arAccCode = await AccountingCode.findOne({ code: "1.1.03" });
    if (!arAccCode) {
        await AccountingCode.create({
            code: "1.1.03",
            name: "Accounts Receivable",
            category: "ASSET",
            type: "DEBIT",
            isActive: true,
            createdBy: testAdmin._id,
            creatorRole: "ADMIN"
        });
    }
    let advAccCode = await AccountingCode.findOne({ code: "2.1.02" });
    if (!advAccCode) {
        await AccountingCode.create({
            code: "2.1.02",
            name: "Advance Received From Customer",
            category: "LIABILITY",
            type: "CREDIT",
            isActive: true,
            createdBy: testAdmin._id,
            creatorRole: "ADMIN"
        });
    }

    // 3. Clean any existing test records to ensure freshness
    await Customer.deleteMany({ customerId: "CUST-REC-001" });
    await Invoice.deleteMany({ invoiceNumber: { $in: ["INV-REC-101", "INV-REC-102"] } });
    await PaymentReceived.deleteMany({ paymentNumber: "PR-REC-999" });
    
    // 4. Create Test Customer
    const testCustomer = await Customer.create({
        customerId: "CUST-REC-001",
        name: "Test Reconciliation Customer",
        branch: testBranch._id
    });
    console.log("Created Test Customer:", testCustomer.name);

    // 5. Create Test Invoices
    const testInvoice1 = await Invoice.create({
        invoiceNumber: "INV-REC-101",
        customer: testCustomer._id,
        branch: testBranch._id,
        totalAmountDue: 200,
        baseAmount: 200,
        amountPaid: 0,
        balance: 200,
        status: "PENDING",
        invoiceType: "MANUAL",
        invoiceDate: new Date("2026-06-01"),
        dueDate: new Date("2026-06-15")
    });
    const testInvoice2 = await Invoice.create({
        invoiceNumber: "INV-REC-102",
        customer: testCustomer._id,
        branch: testBranch._id,
        totalAmountDue: 150,
        baseAmount: 150,
        amountPaid: 0,
        balance: 150,
        status: "PENDING",
        invoiceType: "MANUAL",
        invoiceDate: new Date("2026-06-01"),
        dueDate: new Date("2026-06-15")
    });
    console.log("Created Test Invoices: INV-REC-101 ($200) and INV-REC-102 ($150)");

    // Define raw rows to import
    const rows = [
        {
            "Payment Number": "PR-REC-999",
            "Customer Name": "  test reconciliation customer ", // Whitespace and case variations
            "Amount Received": "350",
            "Payment Date": "2026-06-01",
            "Invoice Number": "INV-REC-101",
            "Amount Applied to Invoice": "200",
            "Deposit To Account Code": "1020"
        },
        {
            "Payment Number": "PR-REC-999",
            "Customer Name": "  test reconciliation customer ",
            "Amount Received": "350",
            "Payment Date": "2026-06-01",
            "Invoice Number": "INV-REC-102",
            "Amount Applied to Invoice": "150",
            "Deposit To Account Code": "1020"
        }
    ];

    // --- TEST 1: Initial Reconciliation Import ---
    console.log("\n--- TEST 1: Importing and Reconciling Payments ---");
    const result1 = await PaymentImportService.importAndReconcilePayments({
        rows,
        fieldMap: null,
        user: { role: "ADMIN", _id: testAdmin._id }
    });

    console.log("Import Result Summary:", JSON.stringify(result1.summary, null, 2));

    // Verify database updates
    const pReceived = await PaymentReceived.findOne({ paymentNumber: "PR-REC-999" });
    if (!pReceived) throw new Error("PaymentReceived document was not created.");
    console.log("✓ PaymentReceived created successfully. Amount received:", pReceived.amountReceived);
    if (pReceived.amountReceived !== 350) throw new Error("PaymentReceived amount is incorrect.");
    if (pReceived.invoices.length !== 2) throw new Error("PaymentReceived invoices links count is incorrect.");

    const inv1 = await Invoice.findOne({ invoiceNumber: "INV-REC-101" });
    const inv2 = await Invoice.findOne({ invoiceNumber: "INV-REC-102" });

    console.log("✓ Invoice 1 status:", inv1.status, "Balance:", inv1.balance);
    console.log("✓ Invoice 2 status:", inv2.status, "Balance:", inv2.balance);

    if (inv1.status !== "PAID" || inv1.balance !== 0) throw new Error("Invoice 1 reconciliation failed.");
    if (inv2.status !== "PAID" || inv2.balance !== 0) throw new Error("Invoice 2 reconciliation failed.");

    const pTransaction = await PaymentTransaction.findOne({ referenceId: pReceived._id });
    if (!pTransaction) throw new Error("PaymentTransaction document was not created.");
    console.log("✓ PaymentTransaction created. Total Amount:", pTransaction.totalAmount);

    const ledgers = await LedgerEntry.find({ transaction: pTransaction._id });
    console.log(`✓ Ledger Entries created for transaction (${ledgers.length} entries found)`);
    ledgers.forEach(l => {
        console.log(`  Entry Category/Type: ${l.type}, Amount: ${l.amount}, Desc: ${l.description}`);
    });

    // --- TEST 2: Idempotency Check ---
    console.log("\n--- TEST 2: Idempotency (Re-importing Same File) ---");
    const result2 = await PaymentImportService.importAndReconcilePayments({
        rows,
        fieldMap: null,
        user: { role: "ADMIN", _id: testAdmin._id }
    });
    console.log("Re-import Result Summary:", JSON.stringify(result2.summary, null, 2));
    
    const countPayments = await PaymentReceived.countDocuments({ paymentNumber: "PR-REC-999" });
    if (countPayments !== 1) throw new Error("Duplicate PaymentReceived created!");
    console.log("✓ Idempotency verified: PaymentReceived was not duplicated.");

    // --- TEST 3: Historical Repair Check ---
    console.log("\n--- TEST 3: Historical Repair ---");
    console.log("Simulating a broken link: Removing Invoice 2 link from PaymentReceived...");
    
    // Remove invoice link in DB directly
    pReceived.invoices = pReceived.invoices.filter(inv => inv.invoiceNumber !== "INV-REC-102");
    pReceived.amountReceived = 200; // Reset amount received
    await pReceived.save();

    console.log("PaymentReceived invoices links before repair:", pReceived.invoices.map(i => i.invoiceNumber));

    // Run the reconciliation service again
    await PaymentImportService.importAndReconcilePayments({
        rows,
        fieldMap: null,
        user: { role: "ADMIN", _id: testAdmin._id }
    });

    const repairedPReceived = await PaymentReceived.findOne({ paymentNumber: "PR-REC-999" });
    console.log("PaymentReceived invoices links after repair:", repairedPReceived.invoices.map(i => i.invoiceNumber));
    if (repairedPReceived.invoices.length !== 2) throw new Error("Historical repair failed to restore invoice link.");
    if (repairedPReceived.amountReceived !== 350) throw new Error("Historical repair failed to update amountReceived.");
    console.log("✓ Historical Repair successfully recovered missing invoice links and updated values!");

    // --- CLEANUP ---
    console.log("\nCleaning up sandbox test data...");
    await Customer.deleteMany({ customerId: "CUST-REC-001" });
    await Invoice.deleteMany({ invoiceNumber: { $in: ["INV-REC-101", "INV-REC-102"] } });
    await PaymentReceived.deleteMany({ paymentNumber: "PR-REC-999" });
    await PaymentTransaction.deleteMany({ referenceId: pReceived._id });
    await LedgerEntry.deleteMany({ transaction: pTransaction._id });

    // Clean testAdmin if we created it
    if (testAdmin.email === "test.admin@reconciliation.com") {
        await Admin.deleteOne({ _id: testAdmin._id });
        console.log("Removed dummy test admin.");
    }

    console.log("\nALL RECONCILIATION TESTS PASSED SUCCESSFULLY! 🚀");
    process.exit(0);
}

runTest().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});

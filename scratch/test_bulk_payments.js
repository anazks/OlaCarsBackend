const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load backend env
dotenv.config({ path: path.join(__dirname, "../.env") });

const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const PaymentReceived = require("../Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const PaymentTransaction = require("../Src/modules/Payment/Model/PaymentTransactionModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const PaymentReceivedController = require("../Src/modules/PaymentReceived/Controller/PaymentReceivedController");

async function runTest() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // 1. Resolve or create a Branch
        let branch = await Branch.findOne({ isDeleted: false, status: "ACTIVE" });
        if (!branch) {
            console.log("Creating dummy Branch...");
            branch = await Branch.create({
                name: "Panama Branch",
                code: "PAN-" + Math.floor(Math.random() * 100),
                address: "Avenida Balboa",
                city: "Panama City",
                state: "Panama",
                phone: "+507123456",
                country: "Panama",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN",
                status: "ACTIVE"
            });
        }
        console.log("Using Branch:", branch.name, branch._id);

        // 2. Resolve or create AccountingCode
        let accCode = await AccountingCode.findOne({ isDeleted: false, isActive: true });
        if (!accCode) {
            console.log("Creating dummy AccountingCode...");
            accCode = await AccountingCode.create({
                code: "1010",
                name: "Bank Account",
                category: "Bank",
                isActive: true,
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
        }
        console.log("Using AccountingCode:", accCode.name, accCode.code, accCode._id);

        // 3. Resolve or create Customer
        let customer = await Customer.findOne({ name: "ERICK VILLAVERDE", isDeleted: false });
        if (!customer) {
            console.log("Creating test Customer ERICK VILLAVERDE...");
            customer = await Customer.create({
                name: "ERICK VILLAVERDE",
                customerId: "CUST-" + Math.floor(1000 + Math.random() * 9000),
                customerNumber: "CUS-" + Math.floor(1000 + Math.random() * 9000),
                branch: branch._id,
                status: "ACTIVE"
            });
        }
        console.log("Using Customer:", customer.name, customer._id);

        // 4. Create dummy invoice to apply payment to
        const testInvoiceNumber = "MOCK-INV-PAY-" + Math.floor(10000 + Math.random() * 90000);
        console.log("Creating test invoice:", testInvoiceNumber);
        const invoice = await Invoice.create({
            invoiceNumber: testInvoiceNumber,
            invoiceType: "MANUAL",
            customer: customer._id,
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            baseAmount: 180,
            totalAmountDue: 180,
            amountPaid: 0,
            balance: 180,
            status: "PENDING",
            lineItems: [{
                name: "Weekly Lease Fee",
                qty: 1,
                unitPrice: 180,
                total: 180
            }]
        });

        // 5. Mock rows matching Zoho/Excel layout
        const testPaymentNumber = "MOCK-PR-" + Math.floor(10000 + Math.random() * 90000);
        const mockRows = [
            {
                "Payment Number": testPaymentNumber,
                "Customer Name": "ERICK VILLAVERDE",
                "Amount": "180",
                "Deposit To": accCode.name,
                "Deposit To Account Code": accCode.code,
                "Date": "2026-06-10",
                "Mode": "Cash",
                "Description": "Bulk upload test description",
                "Reference Number": "REF-BULK-9988",
                "Invoice Number": testInvoiceNumber,
                "Amount Applied to Invoice": "180"
            }
        ];

        console.log("\nTriggering controller.bulkUploadPayments...");
        const req = {
            body: { rows: mockRows },
            user: { id: new mongoose.Types.ObjectId(), role: "ADMIN" }
        };
        const res = {
            statusCode: 200,
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                this.data = data;
                return this;
            }
        };

        await PaymentReceivedController.bulkUploadPayments(req, res);

        console.log("\n--- Controller JSON Response ---");
        console.log(JSON.stringify(res.data, null, 2));

        // 6. Verification checks
        if (res.statusCode !== 200 || !res.data || !res.data.success) {
            throw new Error(`Controller failed with status ${res.statusCode} and response: ${JSON.stringify(res.data)}`);
        }

        console.log("\nRetrieving created entities...");
        const paymentRec = await PaymentReceived.findOne({ paymentNumber: testPaymentNumber })
            .populate("customerId")
            .populate("depositedTo")
            .populate("branch");

        if (!paymentRec) {
            throw new Error("PaymentReceived document was not created!");
        }

        const updatedInv = await Invoice.findById(invoice._id);
        const paymentTx = await PaymentTransaction.findOne({ referenceId: paymentRec._id });
        const ledgerEntriesCount = paymentTx ? await LedgerEntry.countDocuments({ transaction: paymentTx._id }) : 0;

        console.log("\n--- Verification Report ---");
        console.log("Payment Number:", paymentRec.paymentNumber);
        console.log("Linked Customer:", paymentRec.customerId ? paymentRec.customerId.name : "MISSING!");
        console.log("Amount Received:", paymentRec.amountReceived);
        console.log("Deposited To:", paymentRec.depositedTo ? `${paymentRec.depositedTo.name} (${paymentRec.depositedTo.code})` : "MISSING!");
        console.log("Branch (Expected Panama):", paymentRec.branch ? paymentRec.branch.name : "MISSING!");
        console.log("Invoice Applications:", JSON.stringify(paymentRec.invoices));
        console.log("Invoice Amount Paid (Expected 180):", updatedInv.amountPaid);
        console.log("Invoice Balance (Expected 0):", updatedInv.balance);
        console.log("Invoice Status (Expected PAID):", updatedInv.status);
        console.log("PaymentTransaction Created:", !!paymentTx);
        console.log("Ledger Entries Posted Count:", ledgerEntriesCount);

        let failed = false;
        if (!paymentRec.customerId || paymentRec.customerId.name !== "ERICK VILLAVERDE") {
            console.error("❌ FAIL: Customer not matched correctly.");
            failed = true;
        }
        if (updatedInv.balance !== 0 || updatedInv.status !== "PAID") {
            console.error("❌ FAIL: Invoice balance/status not updated correctly.");
            failed = true;
        }
        if (!paymentTx) {
            console.error("❌ FAIL: PaymentTransaction not created.");
            failed = true;
        }
        if (ledgerEntriesCount === 0) {
            console.error("❌ FAIL: Ledger entries were not posted.");
            failed = true;
        }

        if (!failed) {
            console.log("\n✅ ALL BACKEND TESTS PASSED SUCCESSFULLY!");
        } else {
            console.log("\n❌ SOME BACKEND TESTS FAILED.");
        }

    } catch (err) {
        console.error("Error running test:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

runTest();

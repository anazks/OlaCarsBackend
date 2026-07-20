require('dotenv').config();
const mongoose = require('mongoose');

const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const { bulkEditTransactions } = require('../Src/modules/BankAccount/Service/BankAccountService');

async function testBulkEditFlow() {
    try {
        console.log("Connecting to DB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.\n");

        const juan = await Customer.findOne({ name: /juan moran/i });
        const jessica = await Customer.findOne({ name: /jessica soto/i });
        const bankAcc = await BankAccount.findOne();

        if (!juan || !jessica || !bankAcc) {
            console.error("Missing test customer or bank account.");
            process.exit(1);
        }

        console.log(`Test Customer A (Jessica Soto): ${jessica._id}`);
        console.log(`Test Customer B (Juan Moran): ${juan._id}`);
        console.log(`Bank Account: ${bankAcc._id} (${bankAcc.accountName})\n`);

        const adminUser = { _id: new mongoose.Types.ObjectId() };

        // 1. Create a dummy BankTransaction linked to Jessica Soto
        const txId = `TEST-TX-${Date.now()}`;
        const bankTx = new BankTransaction({
            bankAccount: bankAcc._id,
            transactionId: txId,
            type: "DEBIT",
            transactionType: "DEBIT",
            amount: 100.00,
            description: `Bank deposit for test`,
            entryDate: new Date(),
            customer: jessica._id,
            customerName: jessica.name,
            status: "COMPLETED",
            accountingCode: bankAcc.accountingCode,
            createdBy: adminUser._id,
            creatorRole: "ADMIN"
        });
        await bankTx.save();

        const bankLedgerEntry = new LedgerEntry({
            accountingCode: bankAcc.accountingCode,
            type: "DEBIT",
            amount: 100.00,
            description: `Bank deposit for test`,
            entryDate: new Date(),
            transactionId: txId,
            contact: jessica._id,
            contactModel: "Customer",
            createdBy: adminUser._id,
            creatorRole: "ADMIN"
        });
        await bankLedgerEntry.save();

        console.log(`Step 1: Created test BankTransaction ${txId} for Jessica Soto ($100.00).`);

        // Perform initial edit linking to Jessica Soto
        console.log("\nRunning initial bulkEditTransactions linking Jessica Soto...");
        await bulkEditTransactions(bankAcc._id, [
            {
                id: bankLedgerEntry._id,
                customer: jessica._id.toString(),
                amount: 100.00,
                type: "DEBIT"
            }
        ]);

        console.log("\nInspecting DB State after initial link to Jessica Soto:");
        const jessicaInvoices = await Invoice.find({ customer: jessica._id });
        console.log("Jessica Invoices:", JSON.stringify(jessicaInvoices.map(i => ({ num: i.invoiceNumber, paid: i.amountPaid, bal: i.balance, status: i.status, payments: i.payments })), null, 2));
        const prJessica = await PaymentReceived.find({ customerId: jessica._id });
        console.log("Jessica PaymentReceived count:", prJessica.length);
        const leJessica = await LedgerEntry.find({ contact: jessica._id });
        console.log("Jessica LedgerEntries count:", leJessica.length);

        // 2. NOW: Perform bulkEditTransactions switching customer from Jessica Soto to Juan Moran!
        console.log("\n---------------------------------------------------------------");
        console.log("Step 2: Switching Customer from Jessica Soto to Juan Moran...");
        console.log("---------------------------------------------------------------\n");

        await bulkEditTransactions(bankAcc._id, [
            {
                id: bankLedgerEntry._id,
                customer: juan._id.toString(),
                amount: 100.00,
                type: "DEBIT"
            }
        ]);

        console.log("\nInspecting DB State AFTER switching to Juan Moran:");
        console.log("--- JESSICA SOTO (UNLINKED) ---");
        const jessicaInvoicesAfter = await Invoice.find({ customer: jessica._id });
        console.log("Jessica Invoices:", JSON.stringify(jessicaInvoicesAfter.map(i => ({ num: i.invoiceNumber, paid: i.amountPaid, bal: i.balance, status: i.status, payments: i.payments })), null, 2));
        const prJessicaAfter = await PaymentReceived.find({ customerId: jessica._id });
        console.log("Jessica PaymentReceived count:", prJessicaAfter.length);
        const leJessicaAfter = await LedgerEntry.find({ contact: jessica._id });
        console.log("Jessica LedgerEntries count:", leJessicaAfter.length);

        console.log("\n--- JUAN MORAN (NEWLY LINKED) ---");
        const juanInvoicesAfter = await Invoice.find({ customer: juan._id });
        console.log("Juan Invoices:", juanInvoicesAfter.map(i => ({ num: i.invoiceNumber, paid: i.amountPaid, bal: i.balance, status: i.status })));
        const prJuanAfter = await PaymentReceived.find({ customerId: juan._id });
        console.log("Juan PaymentReceived count:", prJuanAfter.length);
        const leJuanAfter = await LedgerEntry.find({ contact: juan._id });
        console.log("Juan LedgerEntries count:", leJuanAfter.length);
        leJuanAfter.forEach(le => {
            console.log(`  Entry: ID ${le._id} | Code: ${le.accountingCode} | Type: ${le.type} | Amt: ${le.amount} | Desc: "${le.description}" | MJ: ${le.manualJournal}`);
        });

        // Cleanup test objects
        await BankTransaction.deleteOne({ transactionId: txId });
        await LedgerEntry.deleteMany({ transactionId: txId });

        console.log("\nTest finished.");
        process.exit(0);
    } catch (err) {
        console.error("Test error:", err);
        process.exit(1);
    }
}

testBulkEditFlow();

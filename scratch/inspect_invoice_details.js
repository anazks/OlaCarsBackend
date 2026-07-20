require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const connectDB = require(path.join(__dirname, "../Src/config/dbConfig"));

async function inspectInvoice() {
    await connectDB();

    // Register referenced models
    require("../Src/modules/Customer/Model/CustomerModel");
    require("../Src/modules/Driver/Model/DriverModel");
    require("../Src/modules/Vehicle/Model/VehicleModel");
    const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
    const PaymentReceived = require("../Src/modules/PaymentReceived/Model/PaymentReceivedModel");
    const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
    const ManualJournal = require("../Src/modules/Ledger/Model/ManualJournalModel");
    const BankTransaction = require("../Src/modules/BankAccount/Model/BankTransactionModel");
    const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

    const queryId = "6a5e2eb6303a54ef55457593";

    console.log(`\n===============================================================`);
    console.log(`INSPECTING INVOICE QUERY: ${queryId}`);
    console.log(`===============================================================\n`);

    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(queryId)) {
        invoice = await Invoice.findById(queryId).populate("customer vehicle").lean();
    }

    if (!invoice) {
        invoice = await Invoice.findOne({ invoiceNumber: queryId }).populate("customer vehicle").lean();
    }

    if (!invoice) {
        const allInvs = await Invoice.find({}).lean();
        invoice = allInvs.find(i => String(i._id) === queryId || i.invoiceNumber === queryId || String(i._id).endsWith(queryId));
    }

    if (!invoice) {
        console.log(`❌ Invoice not found for query: ${queryId}`);
        process.exit(1);
    }

    console.log(`--- INVOICE DETAILS ---`);
    console.log(`Invoice ID:        ${invoice._id}`);
    console.log(`Invoice Number:    ${invoice.invoiceNumber}`);
    console.log(`Customer Name:     ${invoice.customer ? (invoice.customer.name || invoice.customer.customerName) : 'N/A'} (${invoice.customer ? invoice.customer._id : 'N/A'})`);
    console.log(`Status:            ${invoice.status}`);
    console.log(`Base Amount:       $${invoice.baseAmount || 0}`);
    console.log(`Total Amount Due:  $${invoice.totalAmountDue || invoice.totalAmount || 0}`);
    console.log(`Amount Paid:       $${invoice.amountPaid || 0}`);
    console.log(`Balance:           $${invoice.balance}`);
    console.log(`Due Date:          ${invoice.dueDate}`);
    console.log(`Payments On Inv:   `, JSON.stringify(invoice.payments || [], null, 2));

    // 2. Payments Received
    const paymentsReceived = await PaymentReceived.find({
        $or: [
            { "invoices.invoiceId": invoice._id },
            { invoiceId: invoice._id },
            { "invoices.invoiceNumber": invoice.invoiceNumber }
        ]
    }).lean();

    console.log(`\n--- PAYMENTS RECEIVED (${paymentsReceived.length} found) ---`);
    paymentsReceived.forEach((pr, i) => {
        console.log(`\n[Payment ${i + 1}]`);
        console.log(`  ID:              ${pr._id}`);
        console.log(`  Payment Number:  ${pr.paymentNumber}`);
        console.log(`  Amount Received: $${pr.amountReceived}`);
        console.log(`  Payment Method:  ${pr.paymentMethod}`);
        console.log(`  Transaction ID:  ${pr.transactionId || 'N/A'}`);
        console.log(`  Invoices Array:  `, JSON.stringify(pr.invoices || [], null, 2));
    });

    // 3. Ledger Entries
    const txIds = [
        invoice.invoiceNumber,
        String(invoice._id),
        ...paymentsReceived.map(pr => pr.paymentNumber),
        ...paymentsReceived.map(pr => pr.transactionId).filter(Boolean),
        ...(invoice.payments || []).map(p => p.transactionId).filter(Boolean)
    ];

    const ledgerEntries = await LedgerEntry.find({
        $or: [
            { transactionId: { $in: txIds } },
            { description: new RegExp(invoice.invoiceNumber, "i") }
        ]
    }).populate("accountingCode").lean();

    console.log(`\n--- LEDGER ENTRIES (${ledgerEntries.length} found) ---`);
    ledgerEntries.forEach((le, i) => {
        console.log(`\n[Leg ${i + 1}]`);
        console.log(`  ID:              ${le._id}`);
        console.log(`  Entry Date:      ${le.entryDate}`);
        console.log(`  Account Code:    ${le.accountingCode ? `${le.accountingCode.code} - ${le.accountingCode.name}` : 'N/A'}`);
        console.log(`  Type:            ${le.type}`);
        console.log(`  Amount:          $${le.amount}`);
        console.log(`  Description:     ${le.description}`);
        console.log(`  Transaction ID:  ${le.transactionId || 'N/A'}`);
        console.log(`  Manual Journal:  ${le.manualJournal || 'N/A'}`);
    });

    // 4. Manual Journals
    const mjIds = ledgerEntries.map(le => le.manualJournal).filter(Boolean);
    if (mjIds.length > 0) {
        const manualJournals = await ManualJournal.find({ _id: { $in: mjIds } }).lean();
        console.log(`\n--- MANUAL JOURNALS (${manualJournals.length} found) ---`);
        manualJournals.forEach((mj, i) => {
            console.log(`\n[Journal ${i + 1}]`);
            console.log(`  ID:              ${mj._id}`);
            console.log(`  Journal Number:  ${mj.journalNumber}`);
            console.log(`  Description:     ${mj.description}`);
            console.log(`  Total Amount:    $${mj.totalAmount}`);
            console.log(`  Status:          ${mj.status}`);
        });
    }

    console.log(`\n===============================================================\n`);
    process.exit(0);
}

inspectInvoice().catch(err => {
    console.error("Error inspecting invoice:", err);
    process.exit(1);
});

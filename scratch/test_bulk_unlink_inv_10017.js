const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
const { bulkEditTransactions } = require('../Src/modules/BankAccount/Service/BankAccountService');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const bankTx = await BankTransaction.findById("6a3244299072322553486362");
    if (!bankTx) {
        console.log("Could not find BankTransaction 6a3244299072322553486362");
        await mongoose.disconnect();
        return;
    }
    console.log(`BankTransaction Account ID: ${bankTx.bankAccount}`);

    const userDoc = await mongoose.model('USER').findOne();
    const createdBy = userDoc._id;
    const creatorRole = "ADMIN";

    // Call bulkEditTransactions to unlink
    console.log("\nCalling bulkEditTransactions to unlink INV-10017...");
    const result = await bulkEditTransactions(
        bankTx.bankAccount,
        [{
            id: "6a5b4c1cba8857a853ded9d0",
            invoice: "",
            customer: "",
            accountingCode: ""
        }],
        createdBy,
        creatorRole
    );

    console.log("\nUnlink result:", result);

    // Verify invoice status and ledger entries
    const invoice = await Invoice.findOne({ invoiceNumber: "INV-10017" });
    console.log(`\nInvoice INV-10017 - Status: ${invoice.status}, Payments: ${invoice.payments.length}`);

    const ledgerEntries = await LedgerEntry.find({
        $or: [
            { _id: "6a5b4c1cba8857a853ded9d0" },
            { _id: "6a5b4c51ba8857a853deda6d" }
        ]
    });
    console.log("\nLedger entries post-unlink:");
    ledgerEntries.forEach(e => {
        console.log(`ID: ${e._id}, Desc: "${e.description}", Contact: ${e.contact}, Code: ${e.accountingCode}`);
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));

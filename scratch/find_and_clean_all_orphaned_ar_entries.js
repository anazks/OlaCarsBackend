const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const { syncAccountingCodeBalances } = require('../Src/modules/BankAccount/Service/BankAccountService');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    // Find Accounts Receivable accounting code
    const AccountingCode = mongoose.model("AccountingCode");
    const arCodeDoc = await AccountingCode.findOne({ code: "1.1.03" }) || await AccountingCode.findOne({ accountType: "Accounts Receivable" });
    if (!arCodeDoc) {
        console.log("Could not find Accounts Receivable accounting code");
        await mongoose.disconnect();
        return;
    }

    console.log(`Using Accounts Receivable Code: ${arCodeDoc.code} (${arCodeDoc._id})`);

    // Find all ledger entries that are credit entries to Accounts Receivable
    const arEntries = await LedgerEntry.find({
        accountingCode: arCodeDoc._id,
        type: "CREDIT"
    });

    console.log(`Found ${arEntries.length} total Credit entries to Accounts Receivable.`);

    let deletedCount = 0;
    const invoiceRegex = /((?:INV|MAN|WRK)-\w+(?:-\w+)*)/i;

    for (const entry of arEntries) {
        const match = entry.description.match(invoiceRegex);
        if (!match) continue;

        const invoiceNumber = match[0];
        const invoice = await Invoice.findOne({ invoiceNumber, isDeleted: false });

        if (!invoice) {
            console.log(`Entry ${entry._id} references invoice ${invoiceNumber} which does not exist. DELETING entry...`);
            await LedgerEntry.deleteOne({ _id: entry._id });
            deletedCount++;
            continue;
        }

        // If the invoice exists, check if it is unpaid (PENDING)
        if (invoice.status === "PENDING" && invoice.payments.length === 0) {
            console.log(`Entry ${entry._id} (Amount: $${entry.amount}, Desc: "${entry.description}") references PENDING invoice ${invoiceNumber} with no payments. DELETING entry...`);
            await LedgerEntry.deleteOne({ _id: entry._id });
            deletedCount++;
        }
    }

    console.log(`\nDeleted ${deletedCount} orphaned/duplicate Accounts Receivable ledger entries.`);

    if (deletedCount > 0) {
        console.log("Syncing Accounts Receivable balances...");
        await syncAccountingCodeBalances(arCodeDoc._id);
        console.log("Balances synced.");
    }

    await mongoose.disconnect();
}

run().catch(err => console.error(err));

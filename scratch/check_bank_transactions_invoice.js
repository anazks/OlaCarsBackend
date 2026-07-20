const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../Src/config/dbConfig");
require("../Src/modules/BankAccount/Model/BankAccountModel");
require("../Src/modules/BankAccount/Model/BankTransactionModel");
require("../Src/modules/Ledger/Model/LedgerEntryModel");
require("../Src/modules/Invoice/Model/InvoiceModel");

(async () => {
    await connectDB();
    const LedgerEntry = mongoose.model("LedgerEntry");
    const BankTransaction = mongoose.model("BankTransaction");

    // Find any BankTransaction with an invoice
    const btWithInvoice = await BankTransaction.find({ invoice: { $exists: true, $ne: null } }).populate('invoice').limit(5);
    console.log(`Found ${btWithInvoice.length} BankTransaction records with invoice`);
    for (const bt of btWithInvoice) {
        console.log(`BT ID: ${bt._id}`);
        console.log(`  transactionId: ${bt.transactionId}`);
        console.log(`  amount: ${bt.amount}, type: ${bt.type}, entryDate: ${bt.entryDate}`);
        console.log(`  invoice: ${bt.invoice?._id} (${bt.invoice?.invoiceNumber})`);
        
        // Find corresponding LedgerEntry by transactionId or fallback
        let le = null;
        if (bt.transactionId) {
            le = await LedgerEntry.findOne({ transactionId: bt.transactionId });
        }
        if (!le) {
            // fallback match
            le = await LedgerEntry.findOne({
                amount: bt.amount,
                type: bt.type,
                // try fuzzy entryDate
                entryDate: {
                    $gte: new Date(new Date(bt.entryDate).getTime() - 1000 * 60 * 60 * 24),
                    $lte: new Date(new Date(bt.entryDate).getTime() + 1000 * 60 * 60 * 24),
                }
            });
        }
        console.log(`  Matching LedgerEntry found? ${!!le}`);
        if (le) {
            console.log(`    LE ID: ${le._id}`);
            console.log(`    LE transactionId: ${le.transactionId}`);
            console.log(`    LE entryDate: ${le.entryDate}`);
            console.log(`    LE manualJournal: ${le.manualJournal}`);
            console.log(`    LE transaction: ${le.transaction}`);
            console.log(`    LE description: ${le.description}`);
        }
        console.log('---');
    }
    
    // Also check all LedgerEntry records that might have invoice referenced directly? (None, since we checked schema, but let's see if any description references it)
    const leWithInvoiceDesc = await LedgerEntry.find({ description: /invoice/i }).limit(5);
    console.log(`Found ${leWithInvoiceDesc.length} LedgerEntry with "invoice" in description`);
    for (const le of leWithInvoiceDesc) {
        console.log(`  LE ID: ${le._id}`);
        console.log(`  LE description: ${le.description}`);
    }

    process.exit(0);
})();

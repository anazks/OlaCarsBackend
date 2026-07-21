const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
        const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
        const Invoice = require('../Src/modules/Invoice/Model/InvoiceModel');
        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
        const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');

        const ledgerId = "6a5f02760726e4fa3aacd4f6";
        const mjId = "6a5f02760726e4fa3aacd4f2";
        const bankTxId = "6a5f02770726e4fa3aacd505";

        console.log("\n=======================================================");
        console.log("1. TARGET LEDGER ENTRY DETAILED BREAKDOWN");
        console.log("=======================================================");
        const le = await LedgerEntry.findById(ledgerId).populate('accountingCode contact');
        console.log({
            ledgerEntryId: le._id,
            date: le.entryDate,
            type: le.type,
            amount: le.amount,
            accountingCode: le.accountingCode ? `${le.accountingCode.code} - ${le.accountingCode.name}` : null,
            description: le.description,
            contactName: le.contact ? (le.contact.name || le.contact.firstName) : null,
            transactionId: le.transactionId,
            manualJournalId: le.manualJournal,
            runningBalance: le.runningBalance,
            createdBy: le.createdBy,
            creatorRole: le.creatorRole
        });

        console.log("\n=======================================================");
        console.log("2. ALL LEDGER ENTRIES IN THIS DOUBLE-ENTRY (MJ: 6a5f02760726e4fa3aacd4f2)");
        console.log("=======================================================");
        const mjLedgers = await LedgerEntry.find({ manualJournal: mjId }).populate('accountingCode contact');
        for (const entry of mjLedgers) {
            console.log({
                ledgerEntryId: entry._id,
                type: entry.type,
                amount: entry.amount,
                accountingCode: entry.accountingCode ? `${entry.accountingCode.code} - ${entry.accountingCode.name}` : null,
                description: entry.description,
                contact: entry.contact ? (entry.contact.name || entry.contact.firstName) : null,
                transactionId: entry.transactionId
            });
        }

        console.log("\n=======================================================");
        console.log("3. BANK TRANSACTION RECORD (6a5f02770726e4fa3aacd505)");
        console.log("=======================================================");
        const bankTx = await BankTransaction.findById(bankTxId).populate('bankAccount');
        if (bankTx) {
            console.log({
                bankTransactionId: bankTx._id,
                date: bankTx.transactionDate,
                type: bankTx.type,
                amount: bankTx.amount,
                description: bankTx.description,
                referenceId: bankTx.referenceId,
                status: bankTx.status,
                bankAccount: bankTx.bankAccount ? `${bankTx.bankAccount.bankName} - ${bankTx.bankAccount.accountName} (${bankTx.bankAccount.accountNumber})` : null,
                setOffSummary: bankTx.setOffSummary,
                linkedInvoices: bankTx.invoices
            });
        }

        console.log("\n=======================================================");
        console.log("4. PAYMENT RECEIVED RECORDS LINKED");
        console.log("=======================================================");
        const payments = await PaymentReceived.find({
            $or: [
                { bankTransaction: bankTxId },
                { referenceNumber: "20260000001" },
                { description: new RegExp("INV-10004", "i") }
            ]
        });
        console.log(`Total PaymentReceived records found: ${payments.length}`);
        for (const p of payments) {
            console.log({
                paymentReceivedId: p._id,
                paymentNumber: p.paymentNumber,
                paymentDate: p.paymentDate,
                amount: p.amount,
                paymentMethod: p.paymentMethod,
                referenceNumber: p.referenceNumber,
                customer: p.contact || p.customer,
                invoicesApplied: p.invoices,
                bankTransaction: p.bankTransaction,
                description: p.description
            });
        }

        console.log("\n=======================================================");
        console.log("5. INVOICE DETAILS (INV-10004)");
        console.log("=======================================================");
        const invoice = await Invoice.findOne({ invoiceNumber: "INV-10004" });
        if (invoice) {
            console.log({
                invoiceId: invoice._id,
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.invoiceDate,
                totalAmount: invoice.totalAmount,
                amountPaid: invoice.amountPaid,
                balanceDue: invoice.balanceDue,
                status: invoice.status,
                paymentsApplied: invoice.payments
            });
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

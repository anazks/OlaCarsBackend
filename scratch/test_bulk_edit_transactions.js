const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankAccountService = require('../Src/modules/BankAccount/Service/BankAccountService');

async function test() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        // 1. Find Customer
        const customer = await Customer.findOne({
            name: { $regex: /jessica soto/i },
            isDeleted: false
        });
        if (!customer) throw new Error("Jessica Soto customer not found");

        // 2. Find Invoice INV-10002
        let invoice = await Invoice.findOne({ invoiceNumber: 'INV-10002' });
        if (!invoice) throw new Error("Invoice INV-10002 not found");
        console.log(`Initial Invoice INV-10002: Status=${invoice.status}, AmountPaid=${invoice.amountPaid}, Balance=${invoice.balance}`);

        // 3. Find or create a bank account
        let bankAccount = await BankAccount.findOne({ isDeleted: false });
        if (!bankAccount) {
            console.log("Creating temporary bank account...");
            bankAccount = new BankAccount({
                accountName: "Test Bank Account",
                bankName: "Test Bank",
                accountNumber: "1234567890",
                currency: "USD",
                accountType: "Bank",
                status: "ACTIVE",
                initialBalance: 1000,
                currentBalance: 1000,
                createdBy: customer._id,
                creatorRole: "ADMIN"
            });
            await bankAccount.save();
        }
        console.log(`Using Bank Account: ${bankAccount.accountName} (ID: ${bankAccount._id})`);

        // 4. Create a test LedgerEntry and matching BankTransaction representing an incoming payment
        const entryDate = new Date();
        const transactionId = "TXN_" + Math.random().toString(36).substring(7).toUpperCase();
        
        console.log("Creating test LedgerEntry...");
        const ledgerEntry = new LedgerEntry({
            accountingCode: bankAccount.accountingCode || new mongoose.Types.ObjectId(),
            type: "DEBIT",
            amount: 100.00,
            description: "Bulk Statement Entry Test",
            entryDate,
            transactionId,
            createdBy: customer._id,
            creatorRole: "ADMIN"
        });
        await ledgerEntry.save();

        console.log("Creating matching BankTransaction...");
        const bankTx = new BankTransaction({
            bankAccount: bankAccount._id,
            accountingCode: ledgerEntry.accountingCode,
            type: "DEBIT",
            amount: 100.00,
            description: "Bulk Statement Entry Test",
            entryDate,
            transactionType: "DEBIT",
            transactionId,
            createdBy: customer._id,
            creatorRole: "ADMIN"
        });
        await bankTx.save();

        console.log(`Created transaction with ID: ${ledgerEntry._id}`);

        // 5. Run bulkEditTransactions: link customer and invoice INV-10002
        console.log("\n--- Triggering Bulk Edit to LINK Invoice ---");
        const updates = [{
            id: ledgerEntry._id,
            customer: customer._id,
            invoice: invoice._id,
            amount: 100.00
        }];

        await BankAccountService.bulkEditTransactions(bankAccount._id, updates);

        // 6. Verify invoice status and balance
        invoice = await Invoice.findOne({ invoiceNumber: 'INV-10002' });
        console.log(`\n--- Verification after Link ---`);
        console.log(`Invoice Status (Expected: PAID): ${invoice.status}`);
        console.log(`Invoice AmountPaid (Expected: 100): ${invoice.amountPaid}`);
        console.log(`Invoice Balance (Expected: 0): ${invoice.balance}`);
        console.log(`Payments count (Expected: 1): ${invoice.payments ? invoice.payments.length : 0}`);

        // 7. Verify BankTransaction links
        const updatedBankTx = await BankTransaction.findOne({ transactionId });
        console.log(`\nBankTransaction Customer (Expected: ${customer._id}): ${updatedBankTx.customer}`);
        console.log(`BankTransaction Invoice (Expected: ${invoice._id}): ${updatedBankTx.invoice}`);

        // 8. Run bulkEditTransactions again: Change amount to 60.00 to verify partial payment recalculation
        console.log("\n--- Triggering Bulk Edit to ADJUST Amount to $60.00 ---");
        const updates2 = [{
            id: ledgerEntry._id,
            customer: customer._id,
            invoice: invoice._id,
            amount: 60.00
        }];

        await BankAccountService.bulkEditTransactions(bankAccount._id, updates2);

        // Verify invoice balance adjusts
        invoice = await Invoice.findOne({ invoiceNumber: 'INV-10002' });
        console.log(`\n--- Verification after Amount Adjustment ---`);
        console.log(`Invoice Status (Expected: PARTIAL): ${invoice.status}`);
        console.log(`Invoice AmountPaid (Expected: 60): ${invoice.amountPaid}`);
        console.log(`Invoice Balance (Expected: 40): ${invoice.balance}`);

        // 9. Run bulkEditTransactions again: Remove invoice mapping to verify payment reversal
        console.log("\n--- Triggering Bulk Edit to UN-LINK / REMOVE Invoice ---");
        const updates3 = [{
            id: ledgerEntry._id,
            customer: customer._id,
            invoice: undefined,
            amount: 60.00
        }];

        await BankAccountService.bulkEditTransactions(bankAccount._id, updates3);

        // Verify invoice reverts
        invoice = await Invoice.findOne({ invoiceNumber: 'INV-10002' });
        console.log(`\n--- Verification after Unlink ---`);
        console.log(`Invoice Status (Expected: PENDING): ${invoice.status}`);
        console.log(`Invoice AmountPaid (Expected: 0): ${invoice.amountPaid}`);
        console.log(`Invoice Balance (Expected: 100): ${invoice.balance}`);

        // Cleanup
        await LedgerEntry.deleteOne({ _id: ledgerEntry._id });
        await BankTransaction.deleteOne({ _id: bankTx._id });
        console.log("\nCleanup completed.");

        process.exit(0);
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
}

test();

const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    // 1. Correct the Accounts Receivable ledger entry description
    const arEntryId = "6a5b45d6ba8857a853dec9d8";
    const arEntry = await LedgerEntry.findById(arEntryId);
    if (arEntry) {
        console.log(`Found Accounts Receivable ledger entry. Current description: "${arEntry.description}"`);
        if (arEntry.description.includes("INV-10014")) {
            arEntry.description = arEntry.description.replace("INV-10014", "INV-10015");
            await arEntry.save();
            console.log(`Successfully updated description to: "${arEntry.description}"`);
        }
    } else {
        console.log(`Could not find Accounts Receivable ledger entry ${arEntryId}`);
    }

    // 2. Fetch the old invoice INV-10014
    const oldInvoice = await Invoice.findOne({ invoiceNumber: "INV-10014" });
    if (oldInvoice) {
        console.log(`\nOld Invoice INV-10014 - Current Status: ${oldInvoice.status}, Payments count: ${oldInvoice.payments.length}`);
        
        // Remove payment from INV-10014 since it was changed/relinked to INV-10015
        const originalLength = oldInvoice.payments.length;
        oldInvoice.payments = (oldInvoice.payments || []).filter(p => p.transactionId !== "20260000001");
        
        if (oldInvoice.payments.length !== originalLength) {
            oldInvoice.amountPaid = oldInvoice.payments.reduce((sum, p) => sum + p.amount, 0);
            oldInvoice.balance = Math.max(0, oldInvoice.totalAmountDue - oldInvoice.amountPaid);
            
            if (oldInvoice.balance <= 0) oldInvoice.status = "PAID";
            else if (oldInvoice.amountPaid > 0) oldInvoice.status = "PARTIAL";
            else oldInvoice.status = "PENDING";
            
            await oldInvoice.save();
            console.log(`Successfully cleaned payments on INV-10014. New Status: ${oldInvoice.status}, Balance: ${oldInvoice.balance}`);
        } else {
            console.log("No matching payment found on INV-10014.");
        }
    }

    // 3. Fetch the new invoice INV-10015
    const newInvoice = await Invoice.findOne({ invoiceNumber: "INV-10015" });
    if (newInvoice) {
        console.log(`\nNew Invoice INV-10015 - Current Status: ${newInvoice.status}, Payments count: ${newInvoice.payments.length}`);
        
        // Add payment to INV-10015 if not already present
        const hasPayment = newInvoice.payments.some(p => p.transactionId === "20260000001");
        if (!hasPayment) {
            newInvoice.payments.push({
                amount: 100.00,
                paidAt: new Date("2026-07-18T09:22:30.335Z"),
                paymentMethod: "Bank Transfer",
                transactionId: "20260000001",
                note: "ACH - JESSICA VALERIA SOTO CASTRO - JESSICA SOTO EU8783"
            });
            
            newInvoice.amountPaid = newInvoice.payments.reduce((sum, p) => sum + p.amount, 0);
            newInvoice.balance = Math.max(0, newInvoice.totalAmountDue - newInvoice.amountPaid);
            
            if (newInvoice.balance <= 0) newInvoice.status = "PAID";
            else if (newInvoice.amountPaid > 0) newInvoice.status = "PARTIAL";
            else newInvoice.status = "PENDING";
            
            await newInvoice.save();
            console.log(`Successfully applied payment to INV-10015. New Status: ${newInvoice.status}, Balance: ${newInvoice.balance}`);
        } else {
            console.log("Payment already present on INV-10015.");
        }
    }

    await mongoose.disconnect();
}

run().catch(err => console.error(err));

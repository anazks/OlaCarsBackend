const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.\n");

        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
        const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

        // Start of cutoff date: 16/06/2026 00:00:00.000 UTC
        const sinceDate = new Date('2026-06-16T00:00:00.000Z');
        
        console.log(`=======================================================`);
        console.log(`DATA AUDIT: RECORDS SINCE 16/06/2026 (${sinceDate.toISOString()})`);
        console.log(`=======================================================\n`);

        // -------------------------------------------------------
        // 1. INVOICES CREATED / GENERATED SINCE 16/06/2026
        // -------------------------------------------------------
        const invoiceSinceFilter = {
            isDeleted: { $ne: true },
            $or: [
                { generatedAt: { $gte: sinceDate } },
                { createdAt: { $gte: sinceDate } },
                { invoiceDate: { $gte: sinceDate } }
            ]
        };

        const totalInvoicesCount = await Invoice.countDocuments(invoiceSinceFilter);

        // Status Breakdown
        const invoicesByStatus = await Invoice.aggregate([
            { $match: invoiceSinceFilter },
            { 
                $group: { 
                    _id: "$status", 
                    count: { $sum: 1 }, 
                    totalDue: { $sum: "$totalAmountDue" }, 
                    totalPaid: { $sum: "$amountPaid" }, 
                    totalBal: { $sum: "$balance" } 
                } 
            }
        ]);

        // Invoice Type Breakdown
        const invoicesByType = await Invoice.aggregate([
            { $match: invoiceSinceFilter },
            { $group: { _id: { $ifNull: ["$invoiceType", "RENTAL"] }, count: { $sum: 1 }, totalDue: { $sum: "$totalAmountDue" } } }
        ]);

        // Overall Financial Totals
        const invoiceFinancials = await Invoice.aggregate([
            { $match: invoiceSinceFilter },
            {
                $group: {
                    _id: null,
                    totalBilled: { $sum: "$totalAmountDue" },
                    totalPaid: { $sum: "$amountPaid" },
                    totalBalance: { $sum: "$balance" }
                }
            }
        ]);

        const invTotals = invoiceFinancials[0] || { totalBilled: 0, totalPaid: 0, totalBalance: 0 };

        console.log(`-------------------------------------------------------`);
        console.log(`📄 INVOICES SINCE 16/06/2026`);
        console.log(`-------------------------------------------------------`);
        console.log(`Total Invoices Count:      ${totalInvoicesCount}`);
        console.log(`Total Billed Amount:       $${invTotals.totalBilled.toFixed(2)}`);
        console.log(`Total Amount Paid:         $${invTotals.totalPaid.toFixed(2)}`);
        console.log(`Total Remaining Balance:   $${invTotals.totalBalance.toFixed(2)}\n`);

        console.log(`Invoice Status Breakdown:`);
        invoicesByStatus.forEach(st => {
            const statusName = (st._id || 'UNKNOWN').padEnd(10);
            console.log(`  • ${statusName} : ${st.count.toString().padStart(6)} invoice(s) | Billed: $${st.totalDue.toFixed(2).padStart(12)} | Paid: $${st.totalPaid.toFixed(2).padStart(12)} | Balance: $${st.totalBal.toFixed(2).padStart(12)}`);
        });

        console.log(`\nInvoice Type Breakdown:`);
        invoicesByType.forEach(tp => {
            console.log(`  • ${tp._id.padEnd(10)} : ${tp.count.toString().padStart(6)} invoice(s) | Total Billed: $${tp.totalDue.toFixed(2)}`);
        });

        // -------------------------------------------------------
        // 2. PAYMENT RECEIVED RECORDS SINCE 16/06/2026
        // -------------------------------------------------------
        const paymentSinceFilter = {
            isDeleted: { $ne: true },
            $or: [
                { paymentDate: { $gte: sinceDate } },
                { createdAt: { $gte: sinceDate } }
            ]
        };

        const totalPaymentsCount = await PaymentReceived.countDocuments(paymentSinceFilter);

        const paymentsByStatus = await PaymentReceived.aggregate([
            { $match: paymentSinceFilter },
            { $group: { _id: "$status", count: { $sum: 1 }, totalAmount: { $sum: "$amountReceived" } } }
        ]);

        const paymentsByMethod = await PaymentReceived.aggregate([
            { $match: paymentSinceFilter },
            { $group: { _id: { $ifNull: ["$paymentMethod", "Other"] }, count: { $sum: 1 }, totalAmount: { $sum: "$amountReceived" } } }
        ]);

        const paymentFinancials = await PaymentReceived.aggregate([
            { $match: paymentSinceFilter },
            {
                $group: {
                    _id: null,
                    totalReceived: { $sum: "$amountReceived" }
                }
            }
        ]);

        const totalReceived = (paymentFinancials[0] && paymentFinancials[0].totalReceived) || 0;

        console.log(`\n-------------------------------------------------------`);
        console.log(`💳 PAYMENT RECEIVED SINCE 16/06/2026`);
        console.log(`-------------------------------------------------------`);
        console.log(`Total Payment Received Count: ${totalPaymentsCount}`);
        console.log(`Total Amount Received:        $${totalReceived.toFixed(2)}\n`);

        console.log(`Payment Status Breakdown:`);
        paymentsByStatus.forEach(pst => {
            console.log(`  • ${(pst._id || 'UNKNOWN').padEnd(10)} : ${pst.count.toString().padStart(6)} record(s) | Total Amount: $${pst.totalAmount.toFixed(2)}`);
        });

        console.log(`\nPayment Method Breakdown:`);
        paymentsByMethod.forEach(pm => {
            console.log(`  • ${pm._id.padEnd(15)} : ${pm.count.toString().padStart(6)} record(s) | Total Amount: $${pm.totalAmount.toFixed(2)}`);
        });

        // -------------------------------------------------------
        // 3. BANK TRANSACTIONS & GENERAL LEDGER SINCE 16/06/2026
        // -------------------------------------------------------
        const bankTxCount = await BankTransaction.countDocuments({
            isDeleted: { $ne: true },
            $or: [{ transactionDate: { $gte: sinceDate } }, { createdAt: { $gte: sinceDate } }]
        });

        const ledgerCount = await LedgerEntry.countDocuments({
            isDeleted: { $ne: true },
            $or: [{ entryDate: { $gte: sinceDate } }, { createdAt: { $gte: sinceDate } }]
        });

        console.log(`\n-------------------------------------------------------`);
        console.log(`🏦 BANK TRANSACTIONS & LEDGER SINCE 16/06/2026`);
        console.log(`-------------------------------------------------------`);
        console.log(`Bank Transactions Count: ${bankTxCount}`);
        console.log(`General Ledger Entries:  ${ledgerCount}`);

        console.log(`\n=======================================================`);
        console.log(`SUMMARY COMPLETE`);
        console.log(`=======================================================`);

    } catch (err) {
        console.error("Error running audit script:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

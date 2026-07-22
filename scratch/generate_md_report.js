const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
        const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

        const sinceDate = new Date('2026-06-16T00:00:00.000Z');

        // Invoice Filter
        const invoiceFilter = {
            isDeleted: { $ne: true },
            $or: [
                { generatedAt: { $gte: sinceDate } },
                { createdAt: { $gte: sinceDate } },
                { invoiceDate: { $gte: sinceDate } }
            ]
        };

        const totalInvoices = await Invoice.countDocuments(invoiceFilter);
        const statusAgg = await Invoice.aggregate([
            { $match: invoiceFilter },
            { $group: { _id: "$status", count: { $sum: 1 }, totalDue: { $sum: "$totalAmountDue" }, totalPaid: { $sum: "$amountPaid" }, totalBal: { $sum: "$balance" } } },
            { $sort: { count: -1 } }
        ]);

        const typeAgg = await Invoice.aggregate([
            { $match: invoiceFilter },
            { $group: { _id: { $ifNull: ["$invoiceType", "RENTAL"] }, count: { $sum: 1 }, totalDue: { $sum: "$totalAmountDue" }, totalPaid: { $sum: "$amountPaid" }, totalBal: { $sum: "$balance" } } }
        ]);

        const invFinancials = await Invoice.aggregate([
            { $match: invoiceFilter },
            { $group: { _id: null, totalBilled: { $sum: "$totalAmountDue" }, totalPaid: { $sum: "$amountPaid" }, totalBalance: { $sum: "$balance" } } }
        ]);
        const invTotals = invFinancials[0] || { totalBilled: 0, totalPaid: 0, totalBalance: 0 };

        // PaymentReceived Filter
        const paymentFilter = {
            isDeleted: { $ne: true },
            $or: [
                { paymentDate: { $gte: sinceDate } },
                { createdAt: { $gte: sinceDate } }
            ]
        };

        const totalPayments = await PaymentReceived.countDocuments(paymentFilter);
        const paymentStatusAgg = await PaymentReceived.aggregate([
            { $match: paymentFilter },
            { $group: { _id: "$status", count: { $sum: 1 }, totalReceived: { $sum: "$amountReceived" } } }
        ]);

        const paymentMethodAgg = await PaymentReceived.aggregate([
            { $match: paymentFilter },
            { $group: { _id: { $ifNull: ["$paymentMethod", "Other"] }, count: { $sum: 1 }, totalReceived: { $sum: "$amountReceived" } } }
        ]);

        const payFinancials = await PaymentReceived.aggregate([
            { $match: paymentFilter },
            { $group: { _id: null, totalReceived: { $sum: "$amountReceived" } } }
        ]);
        const payTotals = payFinancials[0] || { totalReceived: 0 };

        // BankTx & Ledger
        const bankTxCount = await BankTransaction.countDocuments({
            isDeleted: { $ne: true },
            $or: [{ transactionDate: { $gte: sinceDate } }, { createdAt: { $gte: sinceDate } }]
        });

        const ledgerCount = await LedgerEntry.countDocuments({
            isDeleted: { $ne: true },
            $or: [{ entryDate: { $gte: sinceDate } }, { createdAt: { $gte: sinceDate } }]
        });

        // Format Markdown Content
        const mdContent = `# Audit Report: Invoices & Payment Received (Since 16/06/2026)

**Report Generation Date:** ${new Date().toLocaleString()}  
**Cutoff Filter Date:** Since \`2026-06-16T00:00:00.000Z\` (16 June 2026)

---

## 📊 Executive Summary

| Category | Total Count | Total Billed / Received | Total Paid | Outstanding Balance |
| :--- | :---: | :---: | :---: | :---: |
| **Invoices** | **${totalInvoices.toLocaleString()}** | **$${invTotals.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** | **$${invTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** | **$${invTotals.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** |
| **Payment Received** | **${totalPayments.toLocaleString()}** | **$${payTotals.totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** | — | — |
| **Bank Transactions** | **${bankTxCount.toLocaleString()}** | — | — | — |
| **General Ledger Entries** | **${ledgerCount.toLocaleString()}** | — | — | — |

---

## 📄 Invoice Breakdown (Since 16/06/2026)

### 1. Invoices by Status

| Invoice Status | Count | Percentage | Total Billed | Total Paid | Remaining Balance |
| :--- | :---: | :---: | :---: | :---: | :---: |
${statusAgg.map(s => {
    const pct = ((s.count / totalInvoices) * 100).toFixed(1);
    return `| **\`${s._id || 'UNKNOWN'}\`** | ${s.count.toLocaleString()} | ${pct}% | $${s.totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 })} | $${s.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} | $${s.totalBal.toLocaleString('en-US', { minimumFractionDigits: 2 })} |`;
}).join('\n')}

### 2. Invoices by Type

| Invoice Type | Count | Percentage | Total Billed | Total Paid | Remaining Balance |
| :--- | :---: | :---: | :---: | :---: | :---: |
${typeAgg.map(t => {
    const pct = ((t.count / totalInvoices) * 100).toFixed(1);
    return `| **\`${t._id}\`** | ${t.count.toLocaleString()} | ${pct}% | $${t.totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 })} | $${t.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} | $${t.totalBal.toLocaleString('en-US', { minimumFractionDigits: 2 })} |`;
}).join('\n')}

---

## 💳 Payment Received Breakdown (Since 16/06/2026)

### 1. Payment Received by Status

| Status | Record Count | Percentage | Total Amount Received |
| :--- | :---: | :---: | :---: |
${paymentStatusAgg.map(ps => {
    const pct = ((ps.count / totalPayments) * 100).toFixed(1);
    return `| **\`${ps._id || 'UNKNOWN'}\`** | ${ps.count.toLocaleString()} | ${pct}% | $${ps.totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })} |`;
}).join('\n')}

### 2. Payment Received by Method

| Payment Method | Record Count | Percentage | Total Amount Received |
| :--- | :---: | :---: | :---: |
${paymentMethodAgg.map(pm => {
    const pct = ((pm.count / totalPayments) * 100).toFixed(1);
    return `| **\`${pm._id}\`** | ${pm.count.toLocaleString()} | ${pct}% | $${pm.totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })} |`;
}).join('\n')}

---

## 🏦 Accounting & Banking Summary (Since 16/06/2026)

- **Total Bank Statement Transactions Processed:** ${bankTxCount.toLocaleString()}
- **Total Double-Entry Journal Records Generated:** ${ledgerCount.toLocaleString()}
- **Net Payments Processed via Bank:** $${payTotals.totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}

---
*Report automatically generated by OlaCars Accounting System.*
`;

        const outputPath = path.join(__dirname, '../payment_and_invoice_report_since_16_06_2026.md');
        fs.writeFileSync(outputPath, mdContent, 'utf8');
        console.log(`Markdown report generated successfully at: ${outputPath}`);

    } catch (err) {
        console.error("Error generating report:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

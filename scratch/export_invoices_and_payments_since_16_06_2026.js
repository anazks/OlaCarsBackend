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
        require('../Src/modules/Customer/Model/CustomerModel');

        const sinceDate = new Date('2026-06-16T00:00:00.000Z');

        // -------------------------------------------------------
        // 1. EXPORT INVOICES TO CSV
        // -------------------------------------------------------
        console.log("Fetching invoices since 16/06/2026...");
        const invoiceFilter = {
            isDeleted: { $ne: true },
            $or: [
                { generatedAt: { $gte: sinceDate } },
                { createdAt: { $gte: sinceDate } },
                { invoiceDate: { $gte: sinceDate } }
            ]
        };

        const invoices = await Invoice.find(invoiceFilter)
            .populate('customer', 'name customerId')
            .sort({ generatedAt: -1, createdAt: -1 })
            .lean();

        console.log(`Found ${invoices.length} invoices. Exporting to CSV...`);
        const invCsvHeader = "Invoice Number,Date,Customer ID,Customer Name,Type,Status,Total Billed,Amount Paid,Balance\n";
        const invCsvRows = invoices.map(inv => {
            const num = `"${inv.invoiceNumber || ''}"`;
            const dateStr = inv.generatedAt ? new Date(inv.generatedAt).toISOString().split('T')[0] : (inv.createdAt ? new Date(inv.createdAt).toISOString().split('T')[0] : '');
            const custId = `"${inv.customer?.customerId || ''}"`;
            const custName = `"${(inv.customer?.name || 'N/A').replace(/"/g, '""')}"`;
            const type = `"${inv.invoiceType || 'RENTAL'}"`;
            const status = `"${inv.status || ''}"`;
            const total = (inv.totalAmountDue || 0).toFixed(2);
            const paid = (inv.amountPaid || 0).toFixed(2);
            const bal = (inv.balance || 0).toFixed(2);

            return `${num},${dateStr},${custId},${custName},${type},${status},${total},${paid},${bal}`;
        });

        const invCsvPath = path.join(__dirname, '../invoices_since_16_06_2026.csv');
        fs.writeFileSync(invCsvPath, invCsvHeader + invCsvRows.join('\n'), 'utf8');
        console.log(`Invoices exported to: ${invCsvPath}`);

        // -------------------------------------------------------
        // 2. EXPORT PAYMENTS RECEIVED TO CSV
        // -------------------------------------------------------
        console.log("Fetching payment received records since 16/06/2026...");
        const paymentFilter = {
            isDeleted: { $ne: true },
            $or: [
                { paymentDate: { $gte: sinceDate } },
                { createdAt: { $gte: sinceDate } }
            ]
        };

        const payments = await PaymentReceived.find(paymentFilter)
            .populate('customerId', 'name customerId')
            .sort({ paymentDate: -1, createdAt: -1 })
            .lean();

        console.log(`Found ${payments.length} payment records. Exporting to CSV...`);
        const payCsvHeader = "Payment Number,Payment Date,Customer ID,Customer Name,Amount Received,Payment Method,Status,Invoices Set-Off\n";
        const payCsvRows = payments.map(p => {
            const pNum = `"${p.paymentNumber || ''}"`;
            const dateStr = p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '');
            const custId = `"${p.customerId?.customerId || ''}"`;
            const custName = `"${(p.customerId?.name || 'N/A').replace(/"/g, '""')}"`;
            const amt = (p.amountReceived || 0).toFixed(2);
            const method = `"${p.paymentMethod || ''}"`;
            const status = `"${p.status || ''}"`;
            const setOffs = `"${(p.invoices || []).map(i => i.invoiceNumber).join('; ')}"`;

            return `${pNum},${dateStr},${custId},${custName},${amt},${method},${status},${setOffs}`;
        });

        const payCsvPath = path.join(__dirname, '../payments_since_16_06_2026.csv');
        fs.writeFileSync(payCsvPath, payCsvHeader + payCsvRows.join('\n'), 'utf8');
        console.log(`Payments exported to: ${payCsvPath}`);

        // -------------------------------------------------------
        // 3. GENERATE SUMMARY MARKDOWN LIST (Sample View)
        // -------------------------------------------------------
        const sampleInvoices = invoices.slice(0, 50);
        const samplePayments = payments.slice(0, 50);

        const mdListContent = `# Full Data Export & List: Invoices & Payments (Since 16/06/2026)

**Export Timestamp:** ${new Date().toLocaleString()}  
**Cutoff Date Filter:** \`2026-06-16T00:00:00.000Z\` (16 June 2026 to Present)

---

## 📥 Full CSV Downloads

The complete datasets have been exported to the following CSV files:
- 📄 **Invoices CSV (6,935 Records):** [\`invoices_since_16_06_2026.csv\`](file:///${invCsvPath.replace(/\\/g, '/')})
- 💳 **Payments Received CSV (26,222 Records):** [\`payments_since_16_06_2026.csv\`](file:///${payCsvPath.replace(/\\/g, '/')})

---

## 📄 Invoices List (Showing Top 50 Most Recent of 6,935)

| # | Invoice Number | Date | Customer | Type | Status | Billed ($) | Paid ($) | Balance ($) |
|---|:---|:---:|:---|:---:|:---:|:---:|:---:|:---:|
${sampleInvoices.map((inv, idx) => {
    const d = inv.generatedAt ? new Date(inv.generatedAt).toISOString().split('T')[0] : '';
    const c = inv.customer?.name || 'N/A';
    return `| ${idx + 1} | **\`${inv.invoiceNumber}\`** | ${d} | ${c} | ${inv.invoiceType || 'RENTAL'} | \`${inv.status}\` | $${(inv.totalAmountDue || 0).toFixed(2)} | $${(inv.amountPaid || 0).toFixed(2)} | $${(inv.balance || 0).toFixed(2)} |`;
}).join('\n')}

---

## 💳 Payments Received List (Showing Top 50 Most Recent of 26,222)

| # | Payment Number | Date | Customer | Method | Status | Amount ($) | Linked Invoices |
|---|:---|:---:|:---|:---:|:---:|:---:|:---|
${samplePayments.map((p, idx) => {
    const d = p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : '';
    const c = p.customerId?.name || 'N/A';
    const invs = (p.invoices || []).map(i => i.invoiceNumber).join(', ');
    return `| ${idx + 1} | **\`${p.paymentNumber}\`** | ${d} | ${c} | ${p.paymentMethod || 'Bank Transfer'} | \`${p.status}\` | $${(p.amountReceived || 0).toFixed(2)} | ${invs || '-'} |`;
}).join('\n')}

---
*Generated by OlaCars Backend Financial Data Service.*
`;

        const mdPath = path.join(__dirname, '../invoices_and_payments_list_since_16_06_2026.md');
        fs.writeFileSync(mdPath, mdListContent, 'utf8');
        console.log(`Markdown list preview saved to: ${mdPath}`);

    } catch (err) {
        console.error("Error exporting data:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        const db = mongoose.connection.db;

        // Fetch all debit notes
        const debitNotes = await db.collection('debitnotes').find({}).toArray();
        console.log(`Fetched ${debitNotes.length} total debit notes from 'debitnotes' collection.`);

        // Fetch invoices with lean projection for fast execution
        console.log('Loading invoices into memory with lean projection...');
        const invoices = await db.collection('invoices').find({}, {
            projection: { invoiceNumber: 1, invoiceType: 1, totalAmountDue: 1, totalAmount: 1, amountPaid: 1, balance: 1, status: 1, isDeleted: 1, notes: 1 }
        }).toArray();
        console.log(`Loaded ${invoices.length} invoices into memory.`);

        // Build exact lookup map for invoices by invoiceNumber (case-insensitive & trimmed)
        const invoiceMapByNumber = {};
        invoices.forEach(inv => {
            if (inv.invoiceNumber) {
                const normKey = String(inv.invoiceNumber).trim().toLowerCase();
                if (!invoiceMapByNumber[normKey]) {
                    invoiceMapByNumber[normKey] = [];
                }
                invoiceMapByNumber[normKey].push(inv);
            }
        });

        // Also fetch customer & driver names for reference
        const customers = await db.collection('customers').find({}).project({ name: 1, companyName: 1 }).toArray();
        const drivers = await db.collection('drivers').find({}).project({ 'personalInfo.fullName': 1, name: 1 }).toArray();
        const custMap = {};
        customers.forEach(c => { custMap[c._id.toString()] = c.name || c.companyName || 'Customer'; });
        drivers.forEach(d => { custMap[d._id.toString()] = d.personalInfo?.fullName || d.name || 'Driver'; });

        const results = [];
        let exactNumberMatchesCount = 0;
        let exactNumberAndAmountMatchesCount = 0;

        debitNotes.forEach((dn, index) => {
            const dnId = dn._id.toString();
            const dnNumberRaw = dn.debitNoteNumber || dn.number || '';
            const normDnNumber = String(dnNumberRaw).trim().toLowerCase();

            const dnAmount = dn.amount !== undefined ? dn.amount : (dn.totalAmount || 0);
            const dnBalance = dn.balance !== undefined ? dn.balance : (dnAmount - (dn.amountPaid || 0));

            let entityName = 'Unassigned';
            if (dn.customerId) entityName = custMap[dn.customerId.toString()] || entityName;
            else if (dn.driverId) entityName = custMap[dn.driverId.toString()] || entityName;
            else if (dn.supplierId) entityName = custMap[dn.supplierId.toString()] || entityName;

            // Search for EXACT invoiceNumber match
            const matchingInvoices = invoiceMapByNumber[normDnNumber] || [];

            const matchedInvoiceDetails = matchingInvoices.map(inv => {
                const invAmount = inv.totalAmountDue !== undefined ? inv.totalAmountDue : (inv.totalAmount || inv.amount || 0);
                const invBalance = inv.balance !== undefined ? inv.balance : (invAmount - (inv.amountPaid || 0));
                
                const amountDiff = Math.abs(invAmount - dnAmount);
                const balanceDiff = Math.abs(invBalance - dnBalance);

                const isExactAmountMatch = amountDiff < 0.01;
                const isExactBalanceMatch = balanceDiff < 0.01;

                return {
                    invoiceId: inv._id.toString(),
                    invoiceNumber: inv.invoiceNumber,
                    invoiceType: inv.invoiceType || inv.type || 'N/A',
                    totalAmountDue: invAmount,
                    balance: invBalance,
                    status: inv.status || 'N/A',
                    isDeleted: !!inv.isDeleted,
                    isExactAmountMatch,
                    isExactBalanceMatch,
                    notes: inv.notes || ''
                };
            });

            if (matchingInvoices.length > 0) {
                exactNumberMatchesCount++;
                if (matchedInvoiceDetails.some(m => m.isExactAmountMatch)) {
                    exactNumberAndAmountMatchesCount++;
                }
            }

            results.push({
                index: index + 1,
                debitNoteId: dnId,
                debitNoteNumber: dnNumberRaw,
                entityName,
                debitNoteAmount: dnAmount,
                debitNoteBalance: dnBalance,
                reason: dn.reason || dn.notes || 'Deposit Charge',
                status: dn.status || 'OPEN',
                exactInvoiceMatchesCount: matchingInvoices.length,
                matchedInvoices: matchedInvoiceDetails
            });
        });

        console.log(`Matching Summary:`);
        console.log(`- Total Debit Notes: ${debitNotes.length}`);
        console.log(`- Exact Invoice Number Matches: ${exactNumberMatchesCount}`);
        console.log(`- Exact Number AND Amount Matches: ${exactNumberAndAmountMatchesCount}`);

        // Build Markdown Report
        let report = `# Exact Number & Due Amount Matching: Debit Notes vs Invoices Report\n\n`;
        report += `Generated on: ${new Date().toLocaleString()}\n\n`;
        report += `## Summary Overview\n`;
        report += `- **Total Debit Notes in DB**: ${debitNotes.length}\n`;
        report += `- **Total Invoices in DB**: ${invoices.length}\n`;
        report += `- **Debit Notes with Exact \`invoiceNumber\` Match**: **${exactNumberMatchesCount}** of ${debitNotes.length}\n`;
        report += `- **Debit Notes with Exact \`invoiceNumber\` AND Due Amount Match**: **${exactNumberAndAmountMatchesCount}** of ${debitNotes.length}\n\n`;
        report += `---\n\n`;

        report += `## Complete Table: All ${debitNotes.length} Debit Notes & Exact Invoice Number / Amount Match\n\n`;
        report += `| # | Debit Note ID | DN Number (\`debitNoteNumber\`) | Customer / Entity | DN Amount ($) | Matching Invoice Count | Linked Invoice ID (\`invoiceNumber\`) | Invoice Due Amount ($) | Amount Match Status |\n`;
        report += `|---|---|---|---|---|---|---|---|---|\n`;

        results.forEach(r => {
            if (r.matchedInvoices.length === 0) {
                report += `| ${r.index} | \`${r.debitNoteId}\` | **${r.debitNoteNumber}** | ${r.entityName} | $${r.debitNoteAmount.toLocaleString()} | 0 | *No Exact \`invoiceNumber\` Match* | — | ❌ No Match |\n`;
            } else {
                r.matchedInvoices.forEach((inv, invIdx) => {
                    const matchStatusTag = inv.isExactAmountMatch 
                        ? '✅ **EXACT NUMBER & DUE AMOUNT MATCH**' 
                        : '⚠️ **NUMBER MATCH, AMOUNT DIFFERENCE**';

                    report += `| ${r.index}${r.matchedInvoices.length > 1 ? `.${invIdx + 1}` : ''} | \`${r.debitNoteId}\` | **${r.debitNoteNumber}** | ${r.entityName} | $${r.debitNoteAmount.toLocaleString()} | ${r.matchedInvoices.length} | \`${inv.invoiceId}\` (**${inv.invoiceNumber}**) | $${inv.totalAmountDue.toLocaleString()} | ${matchStatusTag} |\n`;
                });
            }
        });

        report += `\n\n## Detailed Item-by-Item Breakdown\n\n`;

        results.forEach(r => {
            report += `### ${r.index}. Debit Note: "${r.debitNoteNumber}" (ID: \`${r.debitNoteId}\`)\n`;
            report += `- **Entity/Customer**: ${r.entityName}\n`;
            report += `- **Debit Note Amount**: $${r.debitNoteAmount.toLocaleString()}\n`;
            report += `- **Debit Note Balance**: $${r.debitNoteBalance.toLocaleString()}\n`;
            report += `- **Reason**: ${r.reason}\n`;
            report += `- **Status**: \`${r.status}\`\n`;

            if (r.matchedInvoices.length === 0) {
                report += `- **Exact \`invoiceNumber\` Match**: ❌ None found in \`invoices\` collection.\n\n`;
            } else {
                report += `- **Exact \`invoiceNumber\` Matches Found (${r.matchedInvoices.length})**:\n`;
                r.matchedInvoices.forEach(inv => {
                    report += `  - **Invoice ID**: \`${inv.invoiceId}\`\n`;
                    report += `  - **Invoice Number**: \`${inv.invoiceNumber}\`\n`;
                    report += `  - **Invoice Type**: \`${inv.invoiceType}\`\n`;
                    report += `  - **Invoice Due Amount**: $${inv.totalAmountDue.toLocaleString()}\n`;
                    report += `  - **Invoice Balance**: $${inv.balance.toLocaleString()}\n`;
                    report += `  - **Invoice Status**: \`${inv.status}\` ${inv.isDeleted ? '(Soft Deleted)' : '(Active)'}\n`;
                    report += `  - **Amount Match Verification**: ${inv.isExactAmountMatch ? '✅ MATCHES EXACTLY ($' + r.debitNoteAmount.toLocaleString() + ')' : '⚠️ DIFFERENCE (DN: $' + r.debitNoteAmount.toLocaleString() + ' vs Inv: $' + inv.totalAmountDue.toLocaleString() + ')'}\n`;
                });
                report += `\n`;
            }
        });

        // Write artifact into conversation artifacts directory
        const artifactPath = 'C:\\Users\\anton\\.gemini\\antigravity-ide\\brain\\1bd3c745-6055-4b5a-9e21-3b26233c6855\\exact_debit_note_invoice_matching.md';
        fs.writeFileSync(artifactPath, report, 'utf8');
        console.log(`Report successfully written to artifact path: ${artifactPath}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error running exact match script:', err);
        process.exit(1);
    }
}

run();

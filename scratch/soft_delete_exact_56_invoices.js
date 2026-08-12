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

        // Fetch all 56 debit notes
        const debitNotes = await db.collection('debitnotes').find({}).toArray();
        console.log(`Fetched ${debitNotes.length} total debit notes from DB.`);

        const dnNumbers = debitNotes.map(dn => String(dn.debitNoteNumber || '').trim()).filter(Boolean);
        console.log(`Extracted ${dnNumbers.length} debit note numbers.`);

        // Find the EXACT 56 matching invoices in invoices collection where invoiceNumber matches dnNumbers
        const matchingInvoices = await db.collection('invoices').find({
            invoiceNumber: { $in: dnNumbers }
        }).toArray();

        console.log(`Found ${matchingInvoices.length} matching invoices for the 56 debit notes.`);

        if (matchingInvoices.length === 0) {
            console.log('No matching invoices found.');
            await mongoose.disconnect();
            process.exit(0);
        }

        const invoiceIds = matchingInvoices.map(inv => inv._id);
        const invoiceDetails = matchingInvoices.map(inv => ({
            id: inv._id.toString(),
            invoiceNumber: inv.invoiceNumber,
            invoiceType: inv.invoiceType || inv.type || 'RENTAL',
            amount: inv.totalAmountDue || inv.totalAmount || inv.amount || 0,
            originalStatus: inv.status || 'PENDING'
        }));

        // Perform Soft Delete setting isDeleted: true and status: 'CANCELLED'
        const res = await db.collection('invoices').updateMany(
            { _id: { $in: invoiceIds } },
            { 
                $set: { 
                    isDeleted: true, 
                    status: 'CANCELLED',
                    updatedAt: new Date()
                } 
            }
        );

        console.log(`Soft Delete Summary for Exact 56 Invoices:`);
        console.log(`- Matched Count: ${res.matchedCount}`);
        console.log(`- Modified Count: ${res.modifiedCount}`);

        // Build Markdown Report Artifact
        let report = `# Soft Delete Report: Exact 56 Invoices Matching 56 Debit Notes\n\n`;
        report += `Executed on: ${new Date().toLocaleString()}\n\n`;
        report += `## Summary Overview\n`;
        report += `- **Total Debit Notes**: ${debitNotes.length}\n`;
        report += `- **Total Invoices Soft-Deleted**: **${res.modifiedCount}**\n`;
        report += `- **Applied Updates**: \`isDeleted: true\`, \`status: "CANCELLED"\`\n\n`;
        report += `---\n\n`;

        report += `## List of Soft-Deleted 56 Invoices\n\n`;
        report += `| # | Invoice ID | Invoice Number (\`invoiceNumber\`) | Type | Amount ($) | Original Status | Updated Status |\n`;
        report += `|---|---|---|---|---|---|---|\n`;

        invoiceDetails.forEach((inv, i) => {
            report += `| ${i + 1} | \`${inv.id}\` | **${inv.invoiceNumber}** | ${inv.invoiceType} | $${inv.amount.toLocaleString()} | ${inv.originalStatus} | 🛑 CANCELLED (Soft-Deleted) |\n`;
        });

        // Write artifact
        const artifactPath = 'C:\\Users\\anton\\.gemini\\antigravity-ide\\brain\\1bd3c745-6055-4b5a-9e21-3b26233c6855\\soft_deleted_56_invoices_report.md';
        fs.writeFileSync(artifactPath, report, 'utf8');
        console.log(`Report artifact saved to: ${artifactPath}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error soft deleting exact 56 invoices:', err);
        process.exit(1);
    }
}

run();

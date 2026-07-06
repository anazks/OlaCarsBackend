const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully.");

        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');

        console.log("Querying payment receives with no invoices connected...");
        const payments = await PaymentReceived.find({
            $or: [
                { invoices: { $size: 0 } },
                { invoices: { $exists: false } },
                { invoices: null }
            ]
        }).select('paymentNumber amountReceived status').lean();

        console.log(`Found ${payments.length} payments. Generating markdown file...`);

        // Write directly to the backend project root
        const filePath = path.join(__dirname, '../unlinked_payments.md');
        
        let markdownContent = `# Unlinked Payments Report\n\n`;
        markdownContent += `This document lists all payment receive records that have no connected invoices (applied invoices count is 0 / total applied amount is 0).\n\n`;
        markdownContent += `**Total Records Found:** ${payments.length}\n\n`;
        markdownContent += `| # | Payment Number | Amount Received | Status |\n`;
        markdownContent += `|---|----------------|-----------------|--------|\n`;
        
        payments.forEach((p, idx) => {
            markdownContent += `| ${idx + 1} | ${p.paymentNumber} | ${p.amountReceived} | ${p.status} |\n`;
        });

        fs.writeFileSync(filePath, markdownContent, 'utf8');
        console.log(`Successfully wrote file to ${filePath}`);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.connection.close();
        console.log("Connection closed.");
    }
}

run();

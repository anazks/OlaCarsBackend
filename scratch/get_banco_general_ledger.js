const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Find the Banco General AH 1601 bank account
        const account = await BankAccount.findOne({
            $or: [
                { accountName: /Banco General AH 1601/i },
                { bankName: /Banco General AH 1601/i },
                { accountName: /1601/ },
                { accountNumber: /1601/ }
            ]
        });

        if (!account) {
            console.error("BankAccount 'Banco General AH 1601' not found!");
            // Let's print all active accounts to see if there's a typo
            const allAccounts = await BankAccount.find({ isDeleted: false });
            console.log("Available accounts in DB:");
            allAccounts.forEach(a => {
                console.log(`- Name: "${a.accountName || a.bankName}", Number: "${a.accountNumber}"`);
            });
            process.exit(1);
        }

        console.log(`Found Account: "${account.accountName || account.bankName}"`);
        console.log(`Account Number: ${account.accountNumber}`);
        console.log(`Initial Balance: ${account.initialBalance}`);
        console.log(`Current Balance: ${account.currentBalance}`);
        console.log(`Accounting Code ID: ${account.accountingCode}`);

        // Fetch all LedgerEntry documents linked to this account's accountingCode
        const entries = await LedgerEntry.find({ accountingCode: account.accountingCode }).sort({ entryDate: 1, _id: 1 });
        console.log(`Found ${entries.length} ledger entries`);

        // Format date helper
        const formatDate = (dateStr) => {
            const dateObj = new Date(dateStr);
            if (isNaN(dateObj.getTime())) return dateStr;
            const day = String(dateObj.getUTCDate()).padStart(2, '0');
            const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
            const year = dateObj.getUTCFullYear();
            return `${day}/${month}/${year}`;
        };

        // Construct markdown
        let md = `# Ledger: ${account.accountName || account.bankName}\n\n`;
        md += `**Account Details:**\n`;
        md += `- **Account Name:** ${account.accountName || account.bankName}\n`;
        md += `- **Account Number:** ${account.accountNumber || 'N/A'}\n`;
        md += `- **Account Code:** ${account.accountCode || 'N/A'}\n`;
        md += `- **Initial Balance:** \$${(account.initialBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
        md += `- **Current Balance:** \$${(account.currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n\n`;

        md += `## Account Transactions & Running Balances\n\n`;
        md += `| Date | Description | Ref / Transaction ID | Debit (Deposits) | Credit (Withdrawals) | Running Balance |\n`;
        md += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;
        md += `| *Opening Balance* | | | | | **\$${(account.initialBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}** |\n`;

        let balanceAccum = account.initialBalance || 0;

        for (const entry of entries) {
            const debit = entry.type === 'DEBIT' ? entry.amount : 0;
            const credit = entry.type === 'CREDIT' ? entry.amount : 0;

            const isCreditCard = account.accountType === 'Credit Card';
            if (entry.type === 'DEBIT') {
                balanceAccum = isCreditCard ? (balanceAccum - entry.amount) : (balanceAccum + entry.amount);
            } else if (entry.type === 'CREDIT') {
                balanceAccum = isCreditCard ? (balanceAccum + entry.amount) : (balanceAccum - entry.amount);
            }

            const debitStr = debit > 0 ? `\$${debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-';
            const creditStr = credit > 0 ? `\$${credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-';
            const runningBalStr = `\$${balanceAccum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            md += `| ${formatDate(entry.entryDate || entry.date)} | ${entry.description || ''} | ${entry.transactionId || 'N/A'} | ${debitStr} | ${creditStr} | **${runningBalStr}** |\n`;
        }

        // Save the markdown file
        const outputFilename = 'banco_general_ah_1601_ledger.md';
        const outputPath = path.join(__dirname, `../artifacts/${outputFilename}`);
        
        // Ensure artifacts directory exists
        const artifactsDir = path.dirname(outputPath);
        if (!fs.existsSync(artifactsDir)) {
            fs.mkdirSync(artifactsDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, md, 'utf-8');
        console.log(`Successfully generated markdown file at: ${outputPath}`);

        process.exit(0);
    } catch (err) {
        console.error("Execution failed:", err);
        process.exit(1);
    }
}

run();

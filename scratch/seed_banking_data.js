const mongoose = require('mongoose');
require('dotenv').config();

const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const Admin = require('../Src/modules/Admin/model/adminModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for seeding...");

    // 1. Get branch and admin
    const branch = await Branch.findOne({ name: 'Panama' }) || await Branch.findOne({});
    const admin = await Admin.findOne() || { _id: new mongoose.Types.ObjectId() };
    const branchId = branch ? branch._id : new mongoose.Types.ObjectId();
    const adminId = admin._id;

    console.log(`Using Branch: ${branch ? branch.name : 'Generated'} (${branchId})`);
    console.log(`Using Admin ID: ${adminId}`);

    // 2. Find all Bank and Cash AccountingCodes
    const cashAndBankCodes = await AccountingCode.find({
        category: 'ASSET',
        accountType: { $in: ['Cash', 'Bank'] }
    });
    console.log(`Found ${cashAndBankCodes.length} cash/bank accounting codes in Chart of Accounts.`);

    // 3. Seed missing BankAccounts
    let seedCount = 0;
    for (let i = 0; i < cashAndBankCodes.length; i++) {
        const code = cashAndBankCodes[i];
        
        // We only seed bank accounts for "Bank" type accounting codes
        if (code.accountType !== 'Bank') continue;

        // Check if BankAccount exists
        const existing = await BankAccount.findOne({
            $or: [
                { accountCode: code.code },
                { accountingCode: code._id }
            ]
        });

        if (!existing) {
            // Parse name to get a bankName
            let bankName = 'Ola General Bank';
            if (code.name.toLowerCase().includes('banco general')) {
                bankName = 'Banco General';
            } else if (code.name.toLowerCase().includes('bct')) {
                bankName = 'BCT Bank';
            } else if (code.name.toLowerCase().includes('canal bank')) {
                bankName = 'Canal Bank';
            } else if (code.name.toLowerCase().includes('bi bank')) {
                bankName = 'BI Bank';
            } else if (code.name.toLowerCase().includes('arrendadora')) {
                bankName = 'Arrendadora Ola Cars';
            }

            // Extract account number from name or code and make it unique by suffixing the accounting code
            const numMatch = code.name.match(/\d+/);
            const rawNum = numMatch ? numMatch[0] : 'ACC';
            const accountNumber = `${rawNum}-${code.code.replace(/[\.\-\(\)\s]/g, '')}`;

            const initialBal = 50000 + i * 15000;

            const newAcc = new BankAccount({
                bankName,
                accountNumber,
                accountHolderName: 'Ola Cars Corporate',
                swiftCode: 'OLAUS33XXX',
                ifscCode: 'OLAUS33XXX',
                branchName: 'Panama HQ',
                currency: code.currency || 'USD',
                initialBalance: initialBal,
                currentBalance: initialBal,
                status: 'ACTIVE',
                accountType: 'Bank',
                accountName: code.name,
                accountCode: code.code,
                description: `Automatically seeded for accounting code ${code.code}`,
                accountingCode: code._id
            });

            await newAcc.save();
            console.log(`Seeded BankAccount: ${newAcc.accountName} (${newAcc.accountNumber})`);
            seedCount++;
        } else {
            // Update accountingCode if null
            if (!existing.accountingCode) {
                existing.accountingCode = code._id;
                await existing.save();
                console.log(`Linked existing BankAccount ${existing.accountName} with AccountingCode ${code.code}`);
            }
        }
    }
    console.log(`Finished BankAccount seeding: created ${seedCount} new accounts.`);

    // 4. Seed Ledger entries if empty
    const ledgerCount = await LedgerEntry.countDocuments();
    if (ledgerCount === 0) {
        console.log("Ledger is empty. Seeding historical ledger entries...");

        // Find an INCOME and an EXPENSE accounting code to offset transactions
        const incomeCode = await AccountingCode.findOne({ category: 'INCOME' });
        const expenseCode = await AccountingCode.findOne({ category: 'EXPENSE' });

        if (!incomeCode || !expenseCode) {
            console.error("Could not find INCOME or EXPENSE accounting codes to offset transactions. Seeding aborted.");
            process.exit(1);
        }

        console.log(`Using offset INCOME code: ${incomeCode.code} - ${incomeCode.name}`);
        console.log(`Using offset EXPENSE code: ${expenseCode.code} - ${expenseCode.name}`);

        const today = new Date();

        // Let's seed data for each Cash and Bank accounting code
        for (let idx = 0; idx < cashAndBankCodes.length; idx++) {
            const assetCode = cashAndBankCodes[idx];

            // A. Opening balance: DEBIT assetCode, CREDIT equity/income or just starting debit
            const openingDate = new Date();
            openingDate.setDate(today.getDate() - 30);

            const openingAmount = 100000 + idx * 20000;

            // Debit to cash/bank asset
            await LedgerEntry.create({
                branch: branchId,
                accountingCode: assetCode._id,
                type: 'DEBIT',
                amount: openingAmount,
                description: `Opening Balance / Saldo Inicial - ${assetCode.name}`,
                entryDate: openingDate,
                createdBy: adminId,
                creatorRole: 'ADMIN'
            });

            // B. Daily transactions for the last 15 days
            let balanceAccum = openingAmount;
            for (let day = 15; day >= 1; day--) {
                const txDate = new Date();
                txDate.setDate(today.getDate() - day);
                txDate.setHours(12, 0, 0, 0);

                // Daily Income
                const dailyInflow = Math.floor(Math.random() * 2000) + 500; // 500 to 2500
                // DEBIT asset account
                await LedgerEntry.create({
                    branch: branchId,
                    accountingCode: assetCode._id,
                    type: 'DEBIT',
                    amount: dailyInflow,
                    description: `Daily Collections / Ingresos Diarios - ${assetCode.name}`,
                    entryDate: txDate,
                    createdBy: adminId,
                    creatorRole: 'ADMIN'
                });
                // CREDIT income account
                await LedgerEntry.create({
                    branch: branchId,
                    accountingCode: incomeCode._id,
                    type: 'CREDIT',
                    amount: dailyInflow,
                    description: `Revenue Offset for collections - ${assetCode.name}`,
                    entryDate: txDate,
                    createdBy: adminId,
                    creatorRole: 'ADMIN'
                });

                // Daily Expense
                const dailyOutflow = Math.floor(Math.random() * 1500) + 200; // 200 to 1700
                // CREDIT asset account
                await LedgerEntry.create({
                    branch: branchId,
                    accountingCode: assetCode._id,
                    type: 'CREDIT',
                    amount: dailyOutflow,
                    description: `Daily Operations Payment / Egresos Diarios - ${assetCode.name}`,
                    entryDate: txDate,
                    createdBy: adminId,
                    creatorRole: 'ADMIN'
                });
                // DEBIT expense account
                await LedgerEntry.create({
                    branch: branchId,
                    accountingCode: expenseCode._id,
                    type: 'DEBIT',
                    amount: dailyOutflow,
                    description: `Expense Offset for operations - ${assetCode.name}`,
                    entryDate: txDate,
                    createdBy: adminId,
                    creatorRole: 'ADMIN'
                });

                balanceAccum += (dailyInflow - dailyOutflow);
            }

            // C. Update the BankAccount's currentBalance to match the accumulated ledger balance
            const bankAccDoc = await BankAccount.findOne({ accountingCode: assetCode._id });
            if (bankAccDoc) {
                bankAccDoc.initialBalance = openingAmount;
                bankAccDoc.currentBalance = balanceAccum;
                await bankAccDoc.save();
                console.log(`Updated BankAccount ${bankAccDoc.accountName} balance to match ledger: initial=${openingAmount}, current=${balanceAccum}`);
            }
        }
        console.log("Successfully seeded historical ledger entries.");
    } else {
        console.log(`Ledger already has ${ledgerCount} entries. Skipping ledger entries seeding.`);
    }

    process.exit(0);
}
run();

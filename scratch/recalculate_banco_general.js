const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const { recalculateRunningBalances, syncAccountingCodeBalances } = require('../Src/modules/BankAccount/Service/BankAccountService');

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        // Find the Banco General AH 1601 account
        console.log("Locating 'Banco General AH 1601' bank account...");
        const account = await BankAccount.findOne({
            $or: [
                { bankName: /Banco General AH\s+1601/i },
                { accountName: /Banco General AH\s+1601/i }
            ],
            isDeleted: false
        });

        if (!account) {
            console.error("Error: Bank account 'Banco General AH 1601' not found.");
            console.log("Listing all available bank accounts in the database:");
            const allAccounts = await BankAccount.find({ isDeleted: false });
            allAccounts.forEach(acc => {
                console.log(`- Name: "${acc.accountName}", Bank: "${acc.bankName}", _id: ${acc._id}`);
            });
            process.exit(1);
        }

        console.log(`Found bank account: "${account.accountName || account.bankName}" (_id: ${account._id})`);
        console.log(`Current initial balance: ${account.initialBalance}`);
        console.log(`Current current balance: ${account.currentBalance}`);

        // Set initial balance to 0
        account.initialBalance = 0;
        await account.save();
        console.log("Successfully set initial balance to 0.");

        // Recalculate running balances
        console.log("Recalculating running balances from beginning...");
        const finalBalance = await recalculateRunningBalances(account._id);
        console.log(`Recalculation complete. Final running balance calculated: ${finalBalance}`);

        // Sync accounting code totals
        if (account.accountingCode) {
            console.log(`Syncing accounting code balances for code ID: ${account.accountingCode}...`);
            await syncAccountingCodeBalances(account.accountingCode);
            console.log("Accounting code balances synchronized.");
        }

        // Print final verification
        const refreshedAccount = await BankAccount.findById(account._id);
        console.log("--- FINAL STATUS ---");
        console.log(`Account: ${refreshedAccount.accountName || refreshedAccount.bankName}`);
        console.log(`Initial Balance: ${refreshedAccount.initialBalance}`);
        console.log(`Current Balance: ${refreshedAccount.currentBalance}`);
        console.log("--------------------");

        console.log("Done.");
        process.exit(0);
    } catch (err) {
        console.error("Execution failed:", err);
        process.exit(1);
    }
}

run();

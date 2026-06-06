const mongoose = require('mongoose');
require('dotenv').config();

const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for resetting...");

    // 1. Delete all ledger entries created by our seeding script
    const deleteResult = await LedgerEntry.deleteMany({
        description: {
            $in: [
                /Opening Balance \/ Saldo Inicial/,
                /Daily Collections \/ Ingresos Diarios/,
                /Revenue Offset for collections/,
                /Daily Operations Payment \/ Egresos Diarios/,
                /Expense Offset for operations/
            ]
        }
    });
    console.log(`Deleted ${deleteResult.deletedCount} fabricated ledger entries.`);

    // 2. Reset balances of all BankAccounts to 0 (and keep the accounts)
    const resetResult = await BankAccount.updateMany(
        {},
        {
            $set: {
                initialBalance: 0,
                currentBalance: 0
            }
        }
    );
    console.log(`Reset balances to 0 for ${resetResult.modifiedCount} bank accounts.`);

    // 3. For any BankAccount that is missing its accountingCode reference but has a matching code, link them.
    const bankAccounts = await BankAccount.find({});
    for (const bank of bankAccounts) {
        if (!bank.accountingCode && bank.accountCode) {
            const code = await AccountingCode.findOne({ code: bank.accountCode });
            if (code) {
                bank.accountingCode = code._id;
                await bank.save();
                console.log(`Linked BankAccount ${bank.accountName} (${bank.accountCode}) to AccountingCode ID ${code._id}`);
            }
        }
    }

    console.log("Reset and cleanup completed successfully.");
    process.exit(0);
}
run();

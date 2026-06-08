const mongoose = require('mongoose');
require('dotenv').config();

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for reverting bank accounts...");

    // Deleting all bank accounts except the pre-existing Chase Checking account
    const result = await BankAccount.deleteMany({
        accountNumber: { $ne: "120034005600" }
    });

    console.log(`Successfully deleted ${result.deletedCount} seeded bank accounts.`);

    // Check remaining accounts
    const remaining = await BankAccount.find({});
    console.log("Remaining Bank Accounts in database:");
    console.log(JSON.stringify(remaining.map(b => ({
        id: b._id,
        bankName: b.bankName,
        accountName: b.accountName,
        accountNumber: b.accountNumber
    })), null, 2));

    process.exit(0);
}
run();

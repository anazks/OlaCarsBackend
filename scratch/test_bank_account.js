const mongoose = require("mongoose");
const BankAccountService = require("./Src/modules/BankAccount/Service/BankAccountService");
const connectDB = require("./Src/config/dbConfig");
require("dotenv").config();

const test = async () => {
    try {
        await connectDB();
        console.log("DB Connected");

        const data = {
            bankName: "Test Bank",
            accountNumber: "TEST-" + Date.now(),
            accountHolderName: "Test User",
            initialBalance: 1000
        };

        const account = await BankAccountService.createBankAccount(data);
        console.log("Account created:", account);

        process.exit(0);
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
};

test();

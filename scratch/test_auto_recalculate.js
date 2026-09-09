const connectDB = require("../Src/config/dbConfig");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const BankAccountController = require("../Src/modules/BankAccount/Controller/BankAccountController");

async function testAutoRecalculate() {
    await connectDB();

    const account = await BankAccount.findOne({
        isDeleted: false,
        $or: [{ accountName: /1601/ }, { bankName: /1601/ }, { accountCode: "1.1.02-1" }]
    });

    console.log("Testing auto-recalculate on getBankTransactions for account:", account.accountName, account._id);

    const req = {
        params: { id: account._id.toString() },
        query: { page: 1, limit: 10, startDate: "2026-01-01", endDate: "2026-09-09" },
        user: { _id: "6a280d524f5923cd64ec2fe1", role: "ADMIN" }
    };

    const res = {
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            console.log(`Response Status ${this.statusCode}:`);
            console.log("Success:", data.success);
            console.log("Total Deposits:", data.totalDeposits);
            console.log("Total Withdrawals:", data.totalWithdrawals);
            console.log("Opening Balance:", data.openingBalance);
            console.log("Closing Balance:", data.closingBalance);
            if (data.data && data.data.length > 0) {
                console.log("Latest Tx Running Balance:", data.data[0].runningBalance);
            }
            return this;
        }
    };

    await BankAccountController.getBankTransactions(req, res, (err) => {
        if (err) console.error("Next error:", err);
    });

    process.exit(0);
}

testAutoRecalculate();

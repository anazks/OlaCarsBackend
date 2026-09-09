const connectDB = require("../Src/config/dbConfig");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const BankAccountController = require("../Src/modules/BankAccount/Controller/BankAccountController");

async function testApi() {
    await connectDB();

    const account = await BankAccount.findOne({
        isDeleted: false,
        $or: [{ accountName: /1601/ }, { bankName: /1601/ }, { accountCode: "1.1.02-1" }]
    });

    console.log("Testing recalculate endpoint for account:", account.accountName, account._id);

    const req = {
        params: { id: account._id.toString() },
        user: { _id: "6a280d524f5923cd64ec2fe1", role: "ADMIN" }
    };

    const res = {
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            console.log(`Response Status ${this.statusCode}:`, data);
            return this;
        }
    };

    await BankAccountController.recalculateBankBalances(req, res, (err) => {
        if (err) console.error("Next error:", err);
    });

    process.exit(0);
}

testApi();

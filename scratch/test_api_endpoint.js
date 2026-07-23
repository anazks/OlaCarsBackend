const mongoose = require('mongoose');
require('dotenv').config();

const BankAccountController = require('../Src/modules/BankAccount/Controller/BankAccountController');

async function testController() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const req = {
            params: { id: '6a280e00abfae20029fc99a7' },
            query: { page: '1', limit: '25', sort: 'desc' }
        };

        const res = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                console.log('--- Controller API Response Output ---');
                console.log('Success:', data.success);
                console.log('Total Deposits:', data.totalDeposits);
                console.log('Total Withdrawals:', data.totalWithdrawals);
                console.log('Opening Balance:', data.openingBalance);
                console.log('Current Balance:', data.currentBalance);
                console.log('First 3 Mapped Transactions:');
                data.data.slice(0, 3).forEach((item, idx) => {
                    console.log(`[${idx}] ID: ${item._id}`);
                    console.log(`    Date: ${item.date}`);
                    console.log(`    Desc: ${item.description.substring(0, 50)}`);
                    console.log(`    runningBalance in API response: ${item.runningBalance}`);
                });
            }
        };

        const next = (err) => {
            console.error('Controller next called with error:', err);
        };

        await BankAccountController.getBankTransactions(req, res, next);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testController();

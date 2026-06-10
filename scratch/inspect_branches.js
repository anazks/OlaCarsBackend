const mongoose = require('mongoose');
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
require('dotenv').config();

const inspect = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const branches = await Branch.find({ isDeleted: false });
        console.log(`[BRANCHES] Total: ${branches.length}`);
        branches.forEach(b => {
            console.log(`- ID: ${b._id}, Name: ${b.name}, Code: ${b.code}`);
        });

        const incomeCodes = await require("../Src/modules/AccountingCode/Model/AccountingCodeModel").find({ category: "INCOME", isDeleted: false });
        console.log(`[INCOME CODES] Total: ${incomeCodes.length}`);
        const codeIds = incomeCodes.map(c => c._id);

        const revenueEntries = await LedgerEntry.find({ accountingCode: { $in: codeIds } }).populate('branch');
        console.log(`[REVENUE ENTRIES] Total: ${revenueEntries.length}`);
        const branchCounts = {};
        revenueEntries.forEach(entry => {
            const bName = entry.branch ? entry.branch.name : 'No Branch';
            branchCounts[bName] = (branchCounts[bName] || 0) + 1;
        });
        console.log('[REVENUE ENTRIES BY BRANCH]', branchCounts);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

inspect();

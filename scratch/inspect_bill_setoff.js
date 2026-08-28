const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI).then(async () => {
    require('../Src/modules/Supplier/Model/SupplierModel');
    require('../Src/modules/Branch/Model/BranchModel');
    require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
    const BillRepo = require('../Src/modules/Bill/Repo/BillRepo');
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    
    const billId = '6a914c224a8f443c5e56c23e';
    const bill = await BillRepo.getBillById(billId);
    
    console.log('BillRepo.getBillById ledgerEntries before change:', bill.ledgerEntries?.length);
    if (bill.ledgerEntries) {
        bill.ledgerEntries.forEach(l => console.log('  -', l.type, l.amount, l.accountingCode?.code, l.description));
    }
    
    // Now let's see what related query finds:
    const related = await LedgerEntry.find({
        $or: [
            { bill: bill._id },
            { "bills.billId": bill._id },
            { description: new RegExp(bill.billNumber, "i") }
        ],
        isDeleted: { $ne: true }
    }).populate("accountingCode", "code name category").sort({ entryDate: 1, createdAt: 1 }).lean();
    
    console.log('\nRelated ledger entries count:', related.length);
    related.forEach(l => console.log('  ->', l.entryDate, l.type, l.amount, l.accountingCode?.code, l.description, 'TxId:', l.transactionId));
    
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});

require('dotenv').config();
const mongoose = require('mongoose');

async function checkLedger() {
    await mongoose.connect(process.env.MONGO_URI);
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const Bill = require('../Src/modules/Bill/Model/BillModel');
    
    const bill = await Bill.findOne({ billNumber: "NIL69" });
    if (!bill) {
        console.log("Bill NIL69 not found");
        return;
    }
    console.log("Bill NIL69:", bill._id, "Items count:", bill.items.length, "Total:", bill.totalAmount);
    
    const entries = await LedgerEntry.find({ bill: bill._id });
    console.log(`Found ${entries.length} ledger entries for Bill NIL69:`);
    entries.forEach(e => {
        console.log(` - ${e.type} $${e.amount} | Desc: ${e.description}`);
    });
    
    await mongoose.disconnect();
}
checkLedger();

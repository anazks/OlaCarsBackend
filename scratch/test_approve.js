const mongoose = require('mongoose');
require('dotenv').config();
const { approveBill } = require('../Src/modules/ServiceBill/Service/ServiceBillService');
const { ServiceBill } = require('../Src/modules/ServiceBill/Model/ServiceBillModel');

async function testApprove() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find a DRAFT bill that is isDriverBilled
        const bill = await ServiceBill.findOne({ isDriverBilled: true, status: 'DRAFT' });
        if (!bill) {
            console.log('No DRAFT driver-billed bills found.');
            process.exit(0);
        }
        
        console.log('Found bill:', bill.billNumber);
        
        const user = { id: '6a0429abfbcf609e61d8406d', role: 'WORKSHOPSTAFF' };
        const result = await approveBill(bill._id, user);
        
        console.log('Approval Result:', JSON.stringify(result, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error('Error during approval:', err);
        process.exit(1);
    }
}

testApprove();

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DebitNoteService = require('../Src/modules/DebitNote/Service/DebitNoteService');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        const customer = await Customer.findOne({});
        if (!customer) {
            console.error('No customer found');
            process.exit(1);
        }

        const actor = { id: customer._id, role: 'ADMIN' };

        // Test 1: Create Deposit Debit Note (isDeposit: true)
        const depositDoc = await DebitNoteService.createDebitNote({
            customerId: customer._id,
            isDeposit: true,
            amount: 150,
            reason: 'Test Security Deposit Charge',
            notes: 'Automated test deposit debit note'
        }, actor);

        console.log('Test 1 (Deposit Debit Note):');
        console.log(`- Debit Note ID: ${depositDoc._id}`);
        console.log(`- Number: ${depositDoc.debitNoteNumber}`);
        console.log(`- isDeposit: ${depositDoc.isDeposit}`);

        // Test 2: Create Standard Debit Note (isDeposit: false)
        const standardDoc = await DebitNoteService.createDebitNote({
            customerId: customer._id,
            isDeposit: false,
            amount: 75,
            reason: 'Test Late Fee',
            notes: 'Automated test standard debit note'
        }, actor);

        console.log('\nTest 2 (Standard Debit Note):');
        console.log(`- Debit Note ID: ${standardDoc._id}`);
        console.log(`- Number: ${standardDoc.debitNoteNumber}`);
        console.log(`- isDeposit: ${standardDoc.isDeposit}`);

        // Clean up test docs
        const DebitNote = require('../Src/modules/DebitNote/Model/DebitNoteModel');
        await DebitNote.deleteOne({ _id: depositDoc._id });
        await DebitNote.deleteOne({ _id: standardDoc._id });
        console.log('\nCleaned up test documents.');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error testing deposit debit note creation:', err);
        process.exit(1);
    }
}

run();

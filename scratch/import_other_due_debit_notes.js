const mongoose = require('mongoose');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const filePath = path.join(__dirname, '../otherDue.xlsx');
const workbook = xlsx.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(worksheet);

console.log(`Found ${rows.length} rows in otherDue.xlsx`);

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Admin = require('../Src/modules/Admin/Model/AdminModel');
    const Customer = require('../Src/modules/Customer/Model/CustomerModel');
    const DebitNote = require('../Src/modules/DebitNote/Model/DebitNoteModel');

    // Get admin for createdBy
    const admin = await Admin.findOne();
    const adminId = admin ? admin._id : new mongoose.Types.ObjectId('6a280d524f5923cd64ec2fe1');
    console.log('Admin ID:', adminId);

    let insertedCount = 0;
    let skippedCount = 0;
    const results = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cusCode = row.contact_number ? String(row.contact_number).trim() : '';
        const cusName = row.customer_name ? String(row.customer_name).trim() : '';
        const legacyId = row.customer_id ? String(row.customer_id).trim() : '';

        // Find the customer
        let customerDoc = null;
        if (cusCode) customerDoc = await Customer.findOne({ customerId: cusCode });
        if (!customerDoc && cusName) customerDoc = await Customer.findOne({ name: cusName });
        if (!customerDoc && legacyId) customerDoc = await Customer.findOne({ zohoContactId: legacyId });

        if (!customerDoc) {
            console.error(`Row ${i + 2}: Customer NOT FOUND for code='${cusCode}', name='${cusName}'`);
            skippedCount++;
            continue;
        }

        // Check if this exact transaction already exists (by transaction_number in notes or exact match)
        const txnNumber = row.transaction_number ? String(row.transaction_number).trim() : '';
        
        // Check for duplicates - search by notes containing the transaction number
        const existingDN = await DebitNote.findOne({
            customerId: customerDoc._id,
            amount: Number(row.amount || 0),
            notes: { $regex: txnNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
        });

        if (existingDN) {
            console.log(`Row ${i + 2}: SKIPPED - Already exists as ${existingDN.debitNoteNumber} (txn: ${txnNumber})`);
            skippedCount++;
            continue;
        }

        // Map status
        let rawStatus = row.status ? String(row.status).trim().toUpperCase() : 'OVERDUE';
        let status = 'OVERDUE';
        if (rawStatus === 'OPEN' || rawStatus === 'SENT') status = 'PENDING';
        else if (['CLOSED', 'PAID'].includes(rawStatus)) status = 'PAID';
        else if (['VOID', 'CANCELLED'].includes(rawStatus)) status = 'CANCELLED';
        else if (['DRAFT', 'PARTIAL', 'OVERDUE', 'PENDING'].includes(rawStatus)) status = rawStatus;

        const totalAmount = Number(row.amount || 0);
        const excelBalance = row.balance !== undefined && row.balance !== null ? Number(row.balance) : totalAmount;
        const excelPaid = Math.max(0, totalAmount - excelBalance);

        // Use transaction_number from sheet as debitNoteNumber
        const debitNoteNumber = txnNumber || `OD-${Date.now()}-${i}`;

        // Build accumulated description/notes from all extra fields
        const accumulatedNotes = [
            txnNumber ? `Transaction: ${txnNumber}` : null,
            row.entity ? `Entity: ${row.entity}` : null,
            row.TYPE ? `Type: ${row.TYPE}` : null,
            row.age ? `Age: ${row.age} days` : null,
            row.due_date ? `Due Date: ${row.due_date}` : null,
            row.customer_id ? `Legacy Customer ID: ${row.customer_id}` : null,
            cusCode ? `Contact Number: ${cusCode}` : null,
            row['contact.CF.FLEET NO'] ? `Fleet No: ${row['contact.CF.FLEET NO']}` : null,
            row['contact.CF.VEHICLE NO :'] ? `Vehicle No: ${row['contact.CF.VEHICLE NO :']}` : null,
            row['contact.CF.ACTIVE DATE'] ? `Active Date: ${row['contact.CF.ACTIVE DATE']}` : null,
            row.currency_code ? `Currency: ${row.currency_code}` : null,
            row.entity_id ? `Zoho Entity ID: ${row.entity_id}` : null,
            row.exchange_rate ? `Exchange Rate: ${row.exchange_rate}` : null,
            row.department ? `Department: ${row.department}` : null,
            row.payment_expected_date ? `Payment Expected: ${row.payment_expected_date}` : null,
            row.reminders_sent !== undefined ? `Reminders Sent: ${row.reminders_sent}` : null
        ].filter(Boolean).join(' | ');

        // Use transaction_number as reason (it describes the charge)
        const reason = txnNumber || row.TYPE || 'OTHER DUES';

        const dnData = {
            debitNoteNumber,
            customerId: customerDoc._id,
            driverId: customerDoc.driver ? (customerDoc.driver._id || customerDoc.driver) : undefined,
            amount: totalAmount,
            amountPaid: excelPaid,
            balance: excelBalance,
            debitNoteDate: row.date ? new Date(row.date) : new Date(),
            reason: reason,
            isDeposit: false, // Explicitly set to false
            status: status,
            notes: accumulatedNotes,
            createdBy: adminId,
            creatorRole: 'ADMIN'
        };

        await DebitNote.create(dnData);
        insertedCount++;
        results.push({ row: i + 2, dn: debitNoteNumber, customer: cusName, amount: totalAmount, balance: excelBalance, status });
        console.log(`Row ${i + 2}: INSERTED ${debitNoteNumber} -> Customer: ${cusName}, Amount: $${totalAmount}, Balance: $${excelBalance}, Status: ${status}`);
    }

    console.log('\n========================================');
    console.log(`IMPORT COMPLETED SUCCESSFULLY`);
    console.log(`  Inserted: ${insertedCount}`);
    console.log(`  Skipped:  ${skippedCount}`);
    console.log(`  Total:    ${rows.length}`);
    console.log('========================================');

    if (results.length > 0) {
        console.log('\nInserted Debit Notes:');
        results.forEach(r => {
            console.log(`  ${r.dn} | ${r.customer} | $${r.amount} | Balance: $${r.balance} | ${r.status}`);
        });
    }

    process.exit(0);
}).catch(err => { console.error('IMPORT ERROR:', err); process.exit(1); });

const mongoose = require('mongoose');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const filePath = path.join(__dirname, '../depositdebitnotes - Copy.xlsx');
const workbook = xlsx.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(worksheet);

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Admin = require('../Src/modules/Admin/Model/AdminModel');
    const Customer = require('../Src/modules/Customer/Model/CustomerModel');
    const DebitNote = require('../Src/modules/DebitNote/Model/DebitNoteModel');

    const admin = await Admin.findOne();
    const adminId = admin ? admin._id : new mongoose.Types.ObjectId('6a280d524f5923cd64ec2fe1');

    let insertedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cusCode = row.contact_number ? String(row.contact_number).trim() : '';
        const cusName = row.customer_name ? String(row.customer_name).trim() : '';
        const legacyId = row.customer_id ? String(row.customer_id).trim() : '';

        let customerDoc = null;
        if (cusCode) customerDoc = await Customer.findOne({ customerId: cusCode });
        if (!customerDoc && cusName) customerDoc = await Customer.findOne({ name: cusName });
        if (!customerDoc && legacyId) customerDoc = await Customer.findOne({ zohoContactId: legacyId });

        if (!customerDoc) {
            console.error(`Row ${i + 2}: Customer not found for`, cusCode, cusName);
            continue;
        }

        // Map status
        let rawStatus = row.status ? String(row.status).trim().toUpperCase() : 'OVERDUE';
        let status = 'OVERDUE';
        if (rawStatus === 'OPEN') status = 'PENDING';
        else if (['CLOSED', 'PAID'].includes(rawStatus)) status = 'PAID';
        else if (['VOID', 'CANCELLED'].includes(rawStatus)) status = 'CANCELLED';
        else if (['DRAFT', 'PARTIAL', 'OVERDUE', 'PENDING'].includes(rawStatus)) status = rawStatus;

        const totalAmount = Number(row.amount || 0);
        const excelBalance = row.balance !== undefined && row.balance !== null ? Number(row.balance) : totalAmount;
        const excelPaid = Math.max(0, totalAmount - excelBalance);

        // Build accumulated description/notes
        const accumulatedNotes = [
            row.entity ? `Entity: ${row.entity}` : null,
            row.TYPE ? `Type: ${row.TYPE}` : null,
            row.balance !== undefined ? `Balance: $${row.balance}` : null,
            row.age !== undefined ? `Age: ${row.age} days` : null,
            row.due_date ? `Due Date: ${row.due_date}` : null,
            row.customer_id ? `Legacy Customer ID: ${row.customer_id}` : null,
            row.contact_number ? `Contact Number: ${row.contact_number}` : null,
            row['contact.CF.FLEET NO'] ? `Fleet No: ${row['contact.CF.FLEET NO']}` : null,
            row['contact.CF.VEHICLE NO :'] ? `Vehicle No: ${row['contact.CF.VEHICLE NO :']}` : null,
            row['contact.CF.ACTIVE DATE'] ? `Active Date: ${row['contact.CF.ACTIVE DATE']}` : null,
            row.currency_code ? `Currency: ${row.currency_code}` : null
        ].filter(Boolean).join(' | ');

        const debitNoteNumber = row.transaction_number ? String(row.transaction_number).trim() : `DN-${Date.now()}-${i}`;

        const dnData = {
            debitNoteNumber,
            customerId: customerDoc._id,
            driverId: customerDoc.driver ? (customerDoc.driver._id || customerDoc.driver) : undefined,
            amount: totalAmount,
            amountPaid: excelPaid,
            balance: excelBalance,
            debitNoteDate: row.date ? new Date(row.date) : new Date(),
            reason: row.TYPE ? String(row.TYPE).trim() : 'DEPOSIT',
            status: status,
            notes: accumulatedNotes,
            createdBy: adminId,
            creatorRole: 'ADMIN'
        };

        const existing = await DebitNote.findOne({ debitNoteNumber });
        if (existing) {
            await DebitNote.findByIdAndUpdate(existing._id, { $set: dnData });
            updatedCount++;
        } else {
            await DebitNote.create(dnData);
            insertedCount++;
        }
    }

    console.log(`IMPORT/UPDATE COMPLETED SUCCESSFULLY: ${insertedCount} inserted, ${updatedCount} updated (Total ${insertedCount + updatedCount}/${rows.length}).`);

    process.exit(0);
}).catch(err => { console.error('IMPORT ERROR:', err); process.exit(1); });

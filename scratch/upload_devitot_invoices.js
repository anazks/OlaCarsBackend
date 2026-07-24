const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const xlsx = require('xlsx');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function main() {
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        const filePath = path.join(__dirname, '..', 'invoiceDevitot.xlsx');
        console.log('Reading Excel file:', filePath);
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Parsed ${rows.length} rows from Excel.`);

        const InvoiceService = require('../Src/modules/Invoice/Service/InvoiceService');

        console.log('\n--- Running bulkUploadInvoices ---');
        const result = await InvoiceService.bulkUploadInvoices(rows, 'RENTAL', 'ADMIN', 'ADMIN');
        console.log('Bulk Upload Result:', JSON.stringify(result, null, 2));

        console.log('\n--- Inspecting Created/Updated Invoices in MongoDB ---');
        const db = mongoose.connection.db;
        const invoicesCol = db.collection('invoices');

        for (const row of rows) {
            const invNo = row['invoice_number'] || row['invoice_id'];
            const invDoc = await invoicesCol.findOne({
                $or: [
                    { invoiceNumber: invNo },
                    { invoiceID: invNo },
                    { notes: new RegExp(invNo, 'i') }
                ]
            });

            console.log(`\n========================================`);
            console.log(`Invoice Query: "${invNo}"`);
            console.log(`========================================`);
            if (invDoc) {
                console.log(`_id: ${invDoc._id}`);
                console.log(`invoiceNumber: ${invDoc.invoiceNumber}`);
                console.log(`customer: ${invDoc.customer}`);
                console.log(`status: ${invDoc.status}`);
                console.log(`totalAmountDue: ${invDoc.totalAmountDue}`);
                console.log(`amountPaid: ${invDoc.amountPaid}`);
                console.log(`balance: ${invDoc.balance}`);
                console.log(`taxAmount: ${invDoc.taxAmount}`);
                console.log(`dueDate: ${invDoc.dueDate}`);
                console.log(`lineItems:`, JSON.stringify(invDoc.lineItems, null, 2));
                console.log(`notes:\n${invDoc.notes}`);
            } else {
                console.log('NOT FOUND in DB');
            }
        }

    } catch (err) {
        console.error('Error executing upload:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

main();

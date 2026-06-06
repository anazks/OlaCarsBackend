const mongoose = require('mongoose');
require('dotenv').config();

const InvoiceService = require('../Src/modules/Invoice/Service/InvoiceService');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function testSkipMix() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        let driver = await Driver.findOne({ isDeleted: false });
        if (!driver) {
            console.log('No driver found.');
            return;
        }

        const mockAdminId = new mongoose.Types.ObjectId();

        // Ensure 1010 exists
        let bankAcc = await AccountingCode.findOne({ code: '1010' });
        if (!bankAcc) {
            bankAcc = await AccountingCode.create({
                code: '1010',
                name: 'Bank Account',
                category: 'ASSET',
                createdBy: mockAdminId,
                creatorRole: 'ADMIN'
            });
        }

        // Clean up any leftovers first
        await Invoice.deleteMany({ invoiceNumber: { $in: ['INV-TEST-MIX-1', 'INV-TEST-MIX-2'] } });

        // 1. Create INV-TEST-MIX-1 directly as an existing invoice
        const existingInv = await Invoice.create({
            invoiceNumber: 'INV-TEST-MIX-1',
            invoiceType: 'MANUAL',
            driver: driver._id,
            dueDate: new Date(),
            generatedAt: new Date(),
            baseAmount: 100,
            totalAmountDue: 100,
            amountPaid: 0,
            balance: 100,
            status: 'PENDING',
            lineItems: [{ name: 'Rental', qty: 1, unitPrice: 100, total: 100 }],
            createdBy: mockAdminId,
            creatorRole: 'ADMIN'
        });
        console.log('Created pre-existing invoice: INV-TEST-MIX-1');

        // 2. Prepare bulk upload rows with one existing and one new invoice
        const mockRows = [
            {
                'Invoice Date': '2026-06-01',
                'Invoice Number': 'INV-TEST-MIX-1',
                'Invoice Status': 'Closed',
                'Customer ID': driver.driverId,
                'Customer Name': driver.personalInfo.fullName,
                'Due Date': '2026-06-15',
                'SubTotal': '100',
                'Total': '100',
                'Balance': '0',
                'Item Name': 'Weekly Rental Fee',
                'Quantity': '1',
                'Item Price': '100',
                'Item Total': '100',
                'Account Code': '1010'
            },
            {
                'Invoice Date': '2026-06-01',
                'Invoice Number': 'INV-TEST-MIX-2',
                'Invoice Status': 'Pending',
                'Customer ID': driver.driverId,
                'Customer Name': driver.personalInfo.fullName,
                'Due Date': '2026-06-20',
                'SubTotal': '150',
                'Total': '150',
                'Balance': '150',
                'Item Name': 'Workshop Maintenance',
                'Quantity': '1',
                'Item Price': '150',
                'Item Total': '150'
            }
        ];

        console.log('Running bulkUploadInvoices with mix of existing (duplicate) and new invoices...');
        const result = await InvoiceService.bulkUploadInvoices(
            mockRows,
            'MANUAL',
            mockAdminId,
            'ADMIN'
        );

        console.log('\n--- UPLOAD RESULT ---');
        console.log(JSON.stringify(result, null, 2));

        // Verify INV-TEST-MIX-2 was created and INV-TEST-MIX-1 was skipped
        const mix1 = await Invoice.find({ invoiceNumber: 'INV-TEST-MIX-1' });
        console.log(`INV-TEST-MIX-1 instances in DB: ${mix1.length} (Expected: 1)`);

        const mix2 = await Invoice.findOne({ invoiceNumber: 'INV-TEST-MIX-2' });
        console.log(`INV-TEST-MIX-2 created? ${mix2 ? 'YES' : 'NO'} (Expected: YES)`);

        // Cleanup
        await Invoice.deleteMany({ invoiceNumber: { $in: ['INV-TEST-MIX-1', 'INV-TEST-MIX-2'] } });
        console.log('Cleanup complete.');

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await mongoose.connection.close();
    }
}

testSkipMix();

const mongoose = require('mongoose');
require('dotenv').config();

const InvoiceService = require('../Src/modules/Invoice/Service/InvoiceService');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function testBulkInvoices() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        // 1. Fetch or create a test driver
        let driver = await Driver.findOne({ isDeleted: false });
        if (!driver) {
            console.log('No active driver found, creating a mock driver...');
            driver = await Driver.create({
                driverId: 'DRV-TEST-001',
                personalInfo: {
                    fullName: 'Test Bulk Driver',
                    email: 'testbulk@example.com',
                    phone: '+254700000999'
                },
                isDeleted: false
            });
        }
        console.log(`Using driver: ${driver.personalInfo.fullName} (${driver.driverId})`);

        // 2. Fetch or create a test vehicle and link to driver
        let vehicle = await Vehicle.findOne({ isDeleted: false });
        if (!vehicle) {
            console.log('No vehicle found, creating a mock vehicle...');
            vehicle = await Vehicle.create({
                make: 'Toyota',
                model: 'Fielder',
                year: 2019,
                registrationNumber: 'KCX 999X',
                weeklyRent: 1500,
                isDeleted: false
            });
        }
        driver.currentVehicle = vehicle._id;
        await driver.save();
        console.log(`Linked vehicle ${vehicle.registrationNumber} to driver.`);

        const mockAdminId = new mongoose.Types.ObjectId();
        // Ensure sales account IN0002 exists
        let salesAcc = await AccountingCode.findOne({ code: 'IN0002' });
        if (!salesAcc) {
            salesAcc = await AccountingCode.create({
                code: 'IN0002',
                name: 'Rental Income',
                category: 'INCOME',
                createdBy: mockAdminId,
                creatorRole: 'ADMIN'
            });
        }

        // Ensure accounts receivable 1100 exists
        let arAcc = await AccountingCode.findOne({ code: '1100' });
        if (!arAcc) {
            arAcc = await AccountingCode.create({
                code: '1100',
                name: 'Accounts Receivable',
                category: 'ASSET',
                createdBy: mockAdminId,
                creatorRole: 'ADMIN'
            });
        }

        // Ensure cash/bank account exists
        let cashAcc = await AccountingCode.findOne({ category: 'ASSET', code: { $nin: ['1100', '1200'] } });
        if (!cashAcc) {
            cashAcc = await AccountingCode.create({
                code: '1010',
                name: 'Cash / Bank',
                category: 'ASSET',
                createdBy: mockAdminId,
                creatorRole: 'ADMIN'
            });
        }

        // 3. Prepare bulk upload rows
        const mockRows = [
            // Row 1: Invoice 1 Line 1 - Status: Closed
            {
                'Invoice Date': '2026-06-01',
                'Invoice ID': 'ZOHO-ID-999',
                'Invoice Number': 'INV-999901',
                'Invoice Status': 'Closed',
                'Customer ID': driver.driverId,
                'Customer Name': driver.personalInfo.fullName,
                'Is Inclusive Tax': 'FALSE',
                'Due Date': '2026-06-15',
                'Discount Type': 'Percentage',
                'SubTotal': '150',
                'Total': '174', // 150 + 16% tax (24)
                'Balance': '0',
                'Notes': 'Test notes logic',
                'Item Name': 'Weekly Rental Fee',
                'Item Desc': 'Rent charge',
                'Quantity': '1',
                'Item Price': '150',
                'Item Total': '150',
                'Account': 'Bank Transfer',
                'Account Code': cashAcc.code,
                'Tax ID': 'TAX-99',
                'Item Tax %': '16',
                'Item Tax Amount': '24',
                'Item Tax Type': 'Taxable'
            },
            // Row 2: Invoice 2 Line 1 - Status: Pending
            {
                'Invoice Date': '2026-06-01',
                'Invoice ID': 'ZOHO-ID-998',
                'Invoice Number': 'INV-999902',
                'Invoice Status': 'Pending',
                'Customer ID': driver.driverId,
                'Customer Name': driver.personalInfo.fullName,
                'Is Inclusive Tax': 'FALSE',
                'Due Date': '2026-06-20',
                'SubTotal': '200',
                'Total': '232', // 200 + 16% tax (32)
                'Balance': '232',
                'Notes': 'Test pending invoice',
                'Item Name': 'Workshop Maintenance',
                'Item Desc': 'Repair service',
                'Quantity': '1',
                'Item Price': '200',
                'Item Total': '200',
                'Tax ID': 'TAX-99',
                'Item Tax %': '16',
                'Item Tax Amount': '32',
                'Item Tax Type': 'Taxable'
            }
        ];

        console.log('Running bulkUploadInvoices...');
        const result = await InvoiceService.bulkUploadInvoices(
            mockRows,
            'MANUAL',
            new mongoose.Types.ObjectId(),
            'ADMIN'
        );

        console.log('\n--- UPLOAD RESULT ---');
        console.log(JSON.stringify(result, null, 2));

        if (result.errorCount > 0) {
            throw new Error(`Upload failed with errors: ${result.errors.join(', ')}`);
        }

        // 4. Verify Invoice 1 (INV-999901) - Closed/PAID
        console.log('\nVerifying Invoice 1 (INV-999901) details...');
        const inv1 = await Invoice.findOne({ invoiceNumber: 'INV-999901' });
        if (!inv1) throw new Error('INV-999901 was not created');

        console.log(`- Status: ${inv1.status} (Expected: PAID)`);
        console.log(`- Base Amount: ${inv1.baseAmount} (Expected: 150)`);
        console.log(`- Tax Rate: ${inv1.taxRate}% (Expected: 16%)`);
        console.log(`- Tax Amount: ${inv1.taxAmount} (Expected: 24)`);
        console.log(`- Total Amount Due: ${inv1.totalAmountDue} (Expected: 174)`);
        console.log(`- Notes: "${inv1.notes}"`);
        console.log(`- Vehicle linked: ${inv1.vehicle ? 'YES' : 'NO'} (Expected: YES)`);

        if (inv1.status !== 'PAID') throw new Error('Invoice status is not PAID');
        if (!inv1.notes.includes('Invoice ID: ZOHO-ID-999')) throw new Error('Invoice ID missing from Notes');
        if (!inv1.vehicle) throw new Error('Driver vehicle was not linked to the invoice');

        // Check PaymentReceived record
        const pr = await PaymentReceived.findOne({ 'invoices.invoiceNumber': 'INV-999901' }).populate('depositedTo');
        if (!pr) throw new Error('PaymentReceived record was not created for INV-999901');
        console.log(`- PaymentReceived found: ${pr.paymentNumber}`);
        console.log(`- PaymentReceived Amount: ${pr.amountReceived}`);
        console.log(`- PaymentReceived Date: ${pr.paymentDate.toISOString()} (Expected: 2026-06-15T00:00:00.000Z)`);
        console.log(`- PaymentReceived Deposited To Code: ${pr.depositedTo ? pr.depositedTo.code : 'none'} (Expected: 1010)`);

        // Check Ledger entries for INV-999901 (Invoice Creation & Payment Received)
        console.log('\nVerifying General Ledger entries for INV-999901...');
        const ledgerEntries = await LedgerEntry.find({
            $or: [
                { description: new RegExp('INV-999901') },
                { description: new RegExp(pr.paymentNumber) }
            ]
        }).populate('accountingCode');
        console.log(`Found ${ledgerEntries.length} ledger entry transactions.`);
        for (const entry of ledgerEntries) {
            console.log(`  [${entry.type}] Account: ${entry.accountingCode ? entry.accountingCode.code : 'unknown'} (${entry.accountingCode ? entry.accountingCode.name : 'unknown'}), Amount: ${entry.amount}, Date: ${entry.entryDate.toISOString()}, Desc: "${entry.description}"`);
        }

        // 5. Verify Invoice 2 (INV-999902) - Pending
        console.log('\nVerifying Invoice 2 (INV-999902) details...');
        const inv2 = await Invoice.findOne({ invoiceNumber: 'INV-999902' });
        if (!inv2) throw new Error('INV-999902 was not created');
        console.log(`- Status: ${inv2.status} (Expected: PENDING)`);
        console.log(`- Base Amount: ${inv2.baseAmount} (Expected: 200)`);
        console.log(`- Total Amount Due: ${inv2.totalAmountDue} (Expected: 232)`);
        console.log(`- Balance: ${inv2.balance} (Expected: 232)`);

        if (inv2.status !== 'PENDING') throw new Error('Invoice status is not PENDING');

        // Cleanup
        console.log('\nCleaning up created test records...');
        await Invoice.deleteMany({ invoiceNumber: { $in: ['INV-999901', 'INV-999902'] } });
        await PaymentReceived.deleteMany({ 'invoices.invoiceNumber': { $in: ['INV-999901', 'INV-999902'] } });
        await LedgerEntry.deleteMany({
            $or: [
                { description: new RegExp('INV-999901') },
                { description: new RegExp('INV-999902') },
                { description: new RegExp(pr ? pr.paymentNumber : 'DUMMY_PR') }
            ]
        });
        console.log('Cleanup completed successfully.');

    } catch (err) {
        console.error('Test run failed:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

testBulkInvoices();

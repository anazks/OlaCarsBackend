const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const InvoiceService = require('../Src/modules/Invoice/Service/InvoiceService');

        const Branch = require('../Src/modules/Branch/Model/BranchModel');
        const defaultBranch = await Branch.findOne({ isDeleted: { $ne: true } });

        const testCust = await Customer.create({
            name: `STRICT TEST CUST ${Date.now()}`,
            email: `strict_${Date.now()}@example.com`,
            branch: defaultBranch ? defaultBranch._id : undefined,
            status: "ACTIVE"
        });
        console.log(`Created test customer: ${testCust.name} (${testCust._id})`);

        const rows = [
            {
                'Invoice Date': '2026-07-01',
                'Invoice Number': `INV-STRICT-PENDING-${Date.now()}`,
                'Invoice Status': 'Pending',
                'Customer Name': testCust.name,
                'Item Name': 'Rental Fee',
                'Item Price': '100',
                'Quantity': '1',
                'Due Date': '2026-08-15'
            },
            {
                'Invoice Date': '2026-06-01',
                'Invoice Number': `INV-STRICT-OVERDUE-${Date.now()}`,
                'Invoice Status': 'Overdue',
                'Customer Name': testCust.name,
                'Item Name': 'Late Maintenance Fee',
                'Item Price': '50',
                'Quantity': '1',
                'Due Date': '2026-06-15'
            },
            {
                'Invoice Date': '2026-07-01',
                'Invoice Number': `INV-STRICT-PAID-${Date.now()}`,
                'Invoice Status': 'Paid',
                'Customer Name': testCust.name,
                'Item Name': 'Invalid Paid Fee',
                'Item Price': '200',
                'Quantity': '1',
                'Due Date': '2026-08-15'
            },
            {
                'Invoice Date': '2026-07-01',
                'Invoice Number': `INV-STRICT-DRAFT-${Date.now()}`,
                'Invoice Status': 'Draft',
                'Customer Name': testCust.name,
                'Item Name': 'Invalid Draft Fee',
                'Item Price': '300',
                'Quantity': '1',
                'Due Date': '2026-08-15'
            }
        ];

        console.log("\nExecuting InvoiceService.bulkUploadInvoices...");
        const result = await InvoiceService.bulkUploadInvoices(rows, "MANUAL", "6a2290019fa01283dd165204", "ADMIN");

        console.log("\nUpload Result Summary:");
        console.log(`  • Success Count: ${result.successCount}`);
        console.log(`  • Error Count: ${result.errorCount}`);
        console.log(`  • Skipped Count: ${result.skippedCount}`);
        console.log("  • Errors:", result.errors);

        // Verify DB documents for created invoices
        for (const r of rows.slice(0, 2)) {
            const dbInv = await Invoice.findOne({ invoiceNumber: r['Invoice Number'] });
            if (dbInv) {
                console.log(`\n✓ Verified created invoice ${dbInv.invoiceNumber}:`);
                console.log(`   - Status: ${dbInv.status}`);
                console.log(`   - Total Due: $${dbInv.totalAmountDue}`);
                console.log(`   - Amount Paid: $${dbInv.amountPaid} (MUST BE 0)`);
                console.log(`   - Balance: $${dbInv.balance} (MUST EQUAL TOTAL $${dbInv.totalAmountDue})`);
                console.log(`   - Payments Count: ${dbInv.payments.length} (MUST BE 0)`);
            } else {
                console.error(`❌ Expected invoice ${r['Invoice Number']} to exist in DB!`);
            }
        }

        // Cleanup
        await Customer.deleteOne({ _id: testCust._id });
        await Invoice.deleteMany({ customer: testCust._id });
        console.log("\n✓ Test completed and cleaned up.");

    } catch (err) {
        console.error("Test Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

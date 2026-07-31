const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const Branch = require('../Src/modules/Branch/Model/BranchModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const InvoiceService = require('../Src/modules/Invoice/Service/InvoiceService');

        const defaultBranch = await Branch.findOne({ isDeleted: { $ne: true } });

        const testCust = await Customer.create({
            name: `TAX TEST CUST ${Date.now()}`,
            email: `taxtest_${Date.now()}@example.com`,
            branch: defaultBranch ? defaultBranch._id : undefined,
            status: "ACTIVE"
        });

        // Test Row: Total $116 (Gross tax-inclusive), Tax rate 16%
        const rows = [
            {
                'Invoice Date': '2026-07-01',
                'Invoice Number': `INV-TAX-INC-${Date.now()}`,
                'Invoice Status': 'Pending',
                'Customer Name': testCust.name,
                'Is Inclusive Tax': 'TRUE',
                'Item Name': 'Inclusive Tax Rental Item',
                'Total': '116.00',
                'Item Tax %': '16',
                'Due Date': '2026-08-15'
            }
        ];

        console.log("\nExecuting InvoiceService.bulkUploadInvoices for Tax Inclusive item...");
        const result = await InvoiceService.bulkUploadInvoices(rows, "MANUAL", "6a2290019fa01283dd165204", "ADMIN");

        console.log("Upload Result:", result);

        const dbInv = await Invoice.findOne({ invoiceNumber: rows[0]['Invoice Number'] });
        if (dbInv) {
            console.log(`\n✓ Verified Tax-Inclusive Invoice ${dbInv.invoiceNumber}:`);
            console.log(`   - Total Amount Due: $${dbInv.totalAmountDue} (Gross Total: $116.00)`);
            console.log(`   - Tax Rate: ${dbInv.taxRate}%`);
            console.log(`   - Auto-Calculated Tax Amount: $${dbInv.taxAmount} (Expected: $16.00)`);
            console.log(`   - Auto-Calculated Base Amount: $${dbInv.baseAmount} (Expected: $100.00)`);
            console.log(`   - Balance: $${dbInv.balance}`);
            console.log(`   - Amount Paid: $${dbInv.amountPaid}`);
        } else {
            console.error("❌ Invoice document not found!");
        }

        // Cleanup
        await Customer.deleteOne({ _id: testCust._id });
        await Invoice.deleteMany({ customer: testCust._id });
        console.log("\n✓ Test completed and cleaned up.");

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

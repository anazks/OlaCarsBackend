require('dotenv').config();
const mongoose = require('mongoose');

const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function cleanupAndCreateInvoices() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB successfully.\n");

        const targetCustomerNames = [/juan moran/i, /jessica soto/i];

        // 1. Cleanup existing records for target customers
        for (const nameRegex of targetCustomerNames) {
            const customers = await Customer.find({ name: { $regex: nameRegex } });
            
            if (customers.length === 0) {
                console.log(`⚠️ No customer found matching pattern: ${nameRegex}`);
                continue;
            }

            for (const cust of customers) {
                console.log(`=============================================================`);
                console.log(`Processing Deep Cleanup for Customer: "${cust.name}" (ID: ${cust._id})`);
                console.log(`-------------------------------------------------------------`);

                const custId = cust._id;

                // Find all Invoices for this customer first to get invoice numbers
                const invoices = await Invoice.find({ customer: custId });
                const invNumbers = invoices.map(i => i.invoiceNumber);

                // Build regexes for matching descriptions
                const escapedName = cust.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const nameDescRegex = new RegExp(escapedName, 'i');

                // Delete Invoices
                const invDeleteResult = await Invoice.deleteMany({ customer: custId });
                console.log(`  ✓ Deleted ${invDeleteResult.deletedCount} Invoice(s): ${invNumbers.join(', ') || 'None'}`);

                // Delete PaymentReceived records
                const prDocs = await PaymentReceived.find({ customerId: custId });
                const prNumbers = prDocs.map(p => p.paymentNumber);
                const prDeleteResult = await PaymentReceived.deleteMany({ customerId: custId });
                console.log(`  ✓ Deleted ${prDeleteResult.deletedCount} PaymentReceived record(s): ${prNumbers.join(', ') || 'None'}`);

                // Find LedgerEntries linked by contact OR description
                const searchConditions = [{ contact: custId }, { description: { $regex: nameDescRegex } }];
                if (invNumbers.length > 0) {
                    searchConditions.push({ description: { $in: invNumbers.map(n => new RegExp(n, 'i')) } });
                }

                const ledgerEntries = await LedgerEntry.find({ $or: searchConditions });
                const ledgerIds = ledgerEntries.map(l => l._id);
                const journalIds = [...new Set(ledgerEntries.map(l => l.manualJournal).filter(Boolean))];

                // Delete those LedgerEntries
                const ledgerDeleteResult = await LedgerEntry.deleteMany({ _id: { $in: ledgerIds } });
                console.log(`  ✓ Deleted ${ledgerDeleteResult.deletedCount} LedgerEntry record(s) linked to customer`);

                if (journalIds.length > 0) {
                    await LedgerEntry.deleteMany({ manualJournal: { $in: journalIds } });
                    const mjDeleteResult = await ManualJournal.deleteMany({ _id: { $in: journalIds } });
                    console.log(`  ✓ Deleted ${mjDeleteResult.deletedCount} ManualJournal document(s) associated with customer transactions`);
                }

                // Clear Customer linkage on BankTransactions
                const bankTxUpdateResult = await BankTransaction.updateMany(
                    { $or: [{ customer: custId }, { customerName: { $regex: nameDescRegex } }] },
                    {
                        $unset: { customer: "", customerName: "", invoice: "", setOffSummary: "" },
                        $set: { invoices: [] }
                    }
                );
                console.log(`  ✓ Unlinked customer from ${bankTxUpdateResult.modifiedCount} BankTransaction record(s)`);
                console.log(`Cleanup complete for "${cust.name}".\n`);
            }
        }

        // 2. Create 2 fresh unpaid invoices for each customer
        console.log(`=============================================================`);
        console.log(`Creating Fresh Invoices for Target Customers...`);
        console.log(`-------------------------------------------------------------`);

        // Find last invoice number
        const lastInv = await Invoice.findOne().sort({ createdAt: -1 });
        let currentInvNum = 10000;
        if (lastInv && lastInv.invoiceNumber) {
            const match = lastInv.invoiceNumber.match(/\d+/);
            if (match) {
                currentInvNum = parseInt(match[0], 10);
            }
        }

        for (const nameRegex of targetCustomerNames) {
            const cust = await Customer.findOne({ name: { $regex: nameRegex }, isDeleted: false });
            if (!cust) {
                console.error(`❌ Cannot create invoices: Customer matching ${nameRegex} not found.`);
                continue;
            }

            console.log(`Creating 2 unpaid invoices for "${cust.name}" (${cust._id})...`);

            for (let i = 1; i <= 2; i++) {
                currentInvNum += 1;
                const invNumber = `INV-${currentInvNum}`;
                const baseAmount = 100.00;
                const dueDate = new Date(Date.now() + (i * 7) * 24 * 60 * 60 * 1000); // 7 days & 14 days due

                const newInvoice = new Invoice({
                    invoiceNumber: invNumber,
                    invoiceType: "MANUAL",
                    customer: cust._id,
                    dueDate: dueDate,
                    baseAmount: baseAmount,
                    totalAmountDue: baseAmount,
                    amountPaid: 0,
                    balance: baseAmount,
                    status: "PENDING",
                    lineItems: [{
                        name: `Vehicle Subscription / Rent Charge ${i}`,
                        qty: 1,
                        unitPrice: baseAmount,
                        total: baseAmount
                    }],
                    subtotal: baseAmount,
                    isDeleted: false,
                    creatorRole: "ADMIN"
                });

                await newInvoice.save();
                console.log(`  ✓ Created Invoice #${newInvoice.invoiceNumber} | Amount: $${newInvoice.totalAmountDue} | Due: ${dueDate.toISOString().split('T')[0]}`);
            }
            console.log("");
        }

        console.log("Cleanup and 2 fresh invoices per customer creation finished successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error during cleanup & invoice creation:", err);
        process.exit(1);
    }
}

cleanupAndCreateInvoices();

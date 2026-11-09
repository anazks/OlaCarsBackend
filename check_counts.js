require("dotenv").config();
const mongoose = require("mongoose");

const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");
const Bill = require("./Src/modules/Bill/Model/BillModel");
const PaymentReceived = require("./Src/modules/PaymentReceived/Model/PaymentReceivedModel");
const PaymentMade = require("./Src/modules/PaymentMade/Model/PaymentMadeModel");
const InvoiceSetOffHistory = require("./Src/modules/BankAccount/Model/InvoiceSetOffHistoryModel");

async function checkCounts() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsFresh?appName=Cluster0";
        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB successfully.\n");

        // 1. Invoices
        const totalInvoices = await Invoice.countDocuments();
        const first5Invoices = await Invoice.find({})
            .sort({ createdAt: 1, _id: 1 })
            .limit(5)
            .select("invoiceNumber invoiceType totalAmount balanceDue createdAt status")
            .lean();

        // 2. Bills
        const totalBills = await Bill.countDocuments();
        const first5Bills = await Bill.find({})
            .sort({ createdAt: 1, _id: 1 })
            .limit(5)
            .select("billNumber totalAmount balanceDue createdAt status")
            .lean();

        // Related counts
        const totalPaymentsReceived = await PaymentReceived.countDocuments();
        const totalPaymentsMade = await PaymentMade.countDocuments();
        const totalSetOffHistory = await InvoiceSetOffHistory.countDocuments();

        console.log("==================================================");
        console.log("               CURRENT DATABASE COUNTS            ");
        console.log("==================================================");
        console.log(`\n📄 INVOICES:`);
        console.log(`   Total Invoices:           ${totalInvoices}`);
        console.log(`   First 5 to KEEP:          ${Math.min(5, totalInvoices)}`);
        console.log(`   Invoices to DELETE:       ${Math.max(0, totalInvoices - 5)}`);
        console.log(`\n   --- First 5 Invoices (Ordered by createdAt / _id asc) ---`);
        if (first5Invoices.length === 0) {
            console.log("   (No invoices found)");
        } else {
            first5Invoices.forEach((inv, idx) => {
                console.log(`   ${idx + 1}. No: ${inv.invoiceNumber} | ID: ${inv._id} | Type: ${inv.invoiceType} | Total: $${inv.totalAmount} | Status: ${inv.status} | Created: ${inv.createdAt}`);
            });
        }

        console.log(`\n--------------------------------------------------`);
        console.log(`📑 BILLS:`);
        console.log(`   Total Bills:              ${totalBills}`);
        console.log(`   First 5 to KEEP:          ${Math.min(5, totalBills)}`);
        console.log(`   Bills to DELETE:          ${Math.max(0, totalBills - 5)}`);
        console.log(`\n   --- First 5 Bills (Ordered by createdAt / _id asc) ---`);
        if (first5Bills.length === 0) {
            console.log("   (No bills found)");
        } else {
            first5Bills.forEach((b, idx) => {
                console.log(`   ${idx + 1}. No: ${b.billNumber} | ID: ${b._id} | Total: $${b.totalAmount} | Status: ${b.status} | Created: ${b.createdAt}`);
            });
        }

        console.log(`\n--------------------------------------------------`);
        console.log(`🔗 RELATED COLLECTIONS:`);
        console.log(`   Total PaymentReceived:    ${totalPaymentsReceived}`);
        console.log(`   Total PaymentMade:        ${totalPaymentsMade}`);
        console.log(`   Total InvoiceSetOffHistory: ${totalSetOffHistory}`);
        console.log("==================================================\n");

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("Error checking counts:", err);
        process.exit(1);
    }
}

checkCounts();


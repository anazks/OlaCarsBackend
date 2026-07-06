const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully.\n");

        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const Admin = require('../Src/modules/Admin/model/adminModel');
        const PaymentImportService = require('../Src/modules/PaymentReceived/Service/PaymentImportService');

        // Resolve Admin user
        let adminUser = await Admin.findOne({ role: "ADMIN" });
        if (!adminUser) {
            adminUser = await Admin.findOne({});
        }
        if (!adminUser) {
            console.log("No admin user found. Creating a temporary system admin for audit trace...");
            adminUser = await Admin.create({
                fullName: "System Admin Reconciliation",
                email: "system.reconciliation@olacars.com",
                passwordHash: "$2a$12$dummyhashedpasswordfordevelopmentpurposesonly",
                role: "ADMIN",
                status: "ACTIVE"
            });
        }
        console.log(`Using Admin user for audit trace: ${adminUser.email} (${adminUser._id})`);

        // Fetch all database payments
        console.log("Fetching payments from database...");
        const dbPayments = await PaymentReceived.find({}).lean();
        const dbPaymentsMap = new Map();
        dbPayments.forEach(p => {
            if (p.paymentNumber) {
                const key = String(p.paymentNumber).trim().toLowerCase();
                dbPaymentsMap.set(key, p);
            }
        });
        console.log(`Cached ${dbPaymentsMap.size} database payments.`);

        // Read CSV
        const csvPath = path.join(__dirname, '../Customer_Payment00.csv');
        console.log("Reading CSV file:", csvPath);
        const workbook = XLSX.readFile(csvPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);
        console.log(`Loaded ${rows.length} rows from CSV.`);

        // Identify unlinked rows
        const targetRows = [];
        for (const row of rows) {
            const paymentNumRaw = row["Payment Number"];
            const invoiceNumRaw = row["Invoice Number"];

            if (!paymentNumRaw || !invoiceNumRaw) continue;

            const paymentNum = String(paymentNumRaw).trim();
            const invoiceNum = String(invoiceNumRaw).trim();

            const dbPayment = dbPaymentsMap.get(paymentNum.toLowerCase());
            if (dbPayment) {
                // Check if already linked
                const linkedInvoices = dbPayment.invoices || [];
                const isLinked = linkedInvoices.some(inv => 
                    inv.invoiceNumber && 
                    String(inv.invoiceNumber).trim().toLowerCase() === invoiceNum.toLowerCase()
                );

                if (!isLinked) {
                    targetRows.push(row);
                }
            }
        }

        console.log(`\nIdentified ${targetRows.length} unlinked payment-invoice relationships to reconcile.`);
        if (targetRows.length === 0) {
            console.log("No unlinked payments found. Everything is already connected.");
            return;
        }

        // Process in chunks of 500
        const CHUNK_SIZE = 500;
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalErrors = 0;

        for (let i = 0; i < targetRows.length; i += CHUNK_SIZE) {
            const chunk = targetRows.slice(i, i + CHUNK_SIZE);
            console.log(`\nProcessing chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(targetRows.length / CHUNK_SIZE)} (Rows ${i + 1} - ${Math.min(i + CHUNK_SIZE, targetRows.length)})...`);

            const result = await PaymentImportService.importAndReconcilePayments({
                rows: chunk,
                fieldMap: null,
                user: { role: "ADMIN", _id: adminUser._id }
            });

            if (result.success) {
                const s = result.summary;
                console.log(`Chunk success: Created ${s.createdCount}, Updated ${s.updatedCount}, Errors ${s.errorCount}, Skipped ${s.skippedCount}`);
                totalCreated += s.createdCount || 0;
                totalUpdated += s.updatedCount || 0;
                totalErrors += s.errorCount || 0;
                if (s.errors && s.errors.length > 0) {
                    console.log("Sample errors in this chunk (first 5):", s.errors.slice(0, 5));
                }
            } else {
                console.error("Chunk failed entirely:", result.message);
                totalErrors += chunk.length;
            }
        }

        console.log("\n=========================================");
        console.log("Reconciliation Complete!");
        console.log(`Total Created: ${totalCreated}`);
        console.log(`Total Updated: ${totalUpdated}`);
        console.log(`Total Errors: ${totalErrors}`);
        console.log("=========================================");

    } catch (err) {
        console.error("Execution error:", err);
    } finally {
        await mongoose.connection.close();
        console.log("Connection closed.");
    }
}

run();

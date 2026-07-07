const mongoose = require('mongoose');
const XLSX = require('xlsx');
const fs = require('fs');
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

        // Fetch all database payments
        console.log("Fetching database payments...");
        const dbPayments = await PaymentReceived.find({}).lean();
        console.log(`Fetched ${dbPayments.length} payments from database.`);

        // Index db payments by paymentNumber
        const dbPaymentsMap = new Map();
        dbPayments.forEach(p => {
            if (p.paymentNumber) {
                const key = String(p.paymentNumber).trim().toLowerCase();
                dbPaymentsMap.set(key, p);
            }
        });

        // Read CSV
        const csvPath = path.join(__dirname, '../Customer_Payment00.csv');
        console.log("Reading CSV file:", csvPath);
        const workbook = XLSX.readFile(csvPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);
        console.log(`Loaded ${rows.length} rows from CSV.`);

        const unlinkedRelationships = [];
        let totalCheckedWithInvoices = 0;
        let matchedPaymentsWithMissingInvoiceLink = 0;
        let paymentsNotFound = 0;
        let alreadyLinked = 0;

        for (const row of rows) {
            const paymentNumRaw = row["Payment Number"];
            const invoiceNumRaw = row["Invoice Number"];

            if (!paymentNumRaw) continue;

            const paymentNum = String(paymentNumRaw).trim();
            const invoiceNum = invoiceNumRaw ? String(invoiceNumRaw).trim() : null;

            // We only care about payments where there is an invoice in the CSV
            if (!invoiceNum) continue;

            totalCheckedWithInvoices++;

            const dbKey = paymentNum.toLowerCase();
            const dbPayment = dbPaymentsMap.get(dbKey);

            if (!dbPayment) {
                paymentsNotFound++;
                unlinkedRelationships.push({
                    paymentNumber: paymentNum,
                    invoiceNumber: invoiceNum,
                    amount: row["Amount"] || "",
                    amountApplied: row["Amount Applied to Invoice"] || "",
                    customerName: row["Customer Name"] || "",
                    reason: "Payment not found in database"
                });
            } else {
                // Payment exists in database. Check if the invoice is linked to it.
                const linkedInvoices = dbPayment.invoices || [];
                const isLinked = linkedInvoices.some(inv => 
                    inv.invoiceNumber && 
                    String(inv.invoiceNumber).trim().toLowerCase() === invoiceNum.toLowerCase()
                );

                if (!isLinked) {
                    matchedPaymentsWithMissingInvoiceLink++;
                    unlinkedRelationships.push({
                        paymentNumber: paymentNum,
                        invoiceNumber: invoiceNum,
                        amount: row["Amount"] || "",
                        amountApplied: row["Amount Applied to Invoice"] || "",
                        customerName: row["Customer Name"] || "",
                        reason: "Invoice not linked in database payment"
                    });
                } else {
                    alreadyLinked++;
                }
            }
        }

        console.log("\nComparison Results:");
        console.log("=========================================");
        console.log(`CSV rows with an invoice number: ${totalCheckedWithInvoices}`);
        console.log(`Already connected in database: ${alreadyLinked}`);
        console.log(`Payment exists but invoice NOT linked in database: ${matchedPaymentsWithMissingInvoiceLink}`);
        console.log(`Payment NOT found in database at all: ${paymentsNotFound}`);
        console.log(`Total unconnected relationships found: ${unlinkedRelationships.length}`);
        console.log("=========================================");

        // Generate output CSV
        const outputFields = ["Payment Number", "Invoice Number", "Customer Name", "Amount", "Amount Applied", "Reason"];
        let csvContent = outputFields.join(",") + "\n";

        unlinkedRelationships.forEach(rel => {
            const rowData = [
                rel.paymentNumber,
                rel.invoiceNumber,
                `"${rel.customerName.replace(/"/g, '""')}"`,
                rel.amount,
                rel.amountApplied,
                `"${rel.reason}"`
            ];
            csvContent += rowData.join(",") + "\n";
        });

        const outputPath = path.join(__dirname, '../unlinked_invoices_report.csv');
        fs.writeFileSync(outputPath, csvContent, 'utf8');
        console.log(`\nSuccessfully wrote CSV report to: ${outputPath}`);

    } catch (err) {
        console.error("Error executing comparison:", err);
    } finally {
        await mongoose.connection.close();
        console.log("Connection closed.");
    }
}

run();

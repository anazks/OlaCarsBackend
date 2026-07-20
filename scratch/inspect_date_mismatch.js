const XLSX = require("xlsx");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const filePath = path.join(__dirname, "../Invoice Details 2026.xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log("Comparing first 50 valid rows in Excel with DB:");
    let compared = 0;
    for (const r of rows) {
        if (r["__EMPTY"] === "date") continue; // Skip headers row
        const invNum = r["__EMPTY_2"];
        if (!invNum) continue;

        const inv = await Invoice.findOne({ invoiceNumber: invNum, isDeleted: false }).lean();
        if (inv) {
            console.log(`Invoice: ${invNum}`);
            console.log(`  Excel Date: ${r["__EMPTY"]}, Due Date: ${r["__EMPTY_1"]}`);
            console.log(`  DB generatedAt: ${inv.generatedAt ? inv.generatedAt.toISOString() : 'null'}, dueDate: ${inv.dueDate ? inv.dueDate.toISOString() : 'null'}`);
            compared++;
            if (compared >= 20) break;
        }
    }

    await mongoose.disconnect();
}
run().catch(console.error);

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

// Load environment variables
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");

// Helper to parse dates in various formats robustly
const parseFlexibleDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
    if (typeof dateStr === 'number') {
        const date = new Date((dateStr - 25569) * 86400 * 1000);
        return isNaN(date.getTime()) ? null : date;
    }
    const str = dateStr.toString().trim();
    if (!str) return null;

    // 1. Check YYYY-MM-DD or YYYY/MM/DD
    const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    let match = str.match(ymdRegex);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        return new Date(year, month, day);
    }

    // 2. Check DD-MM-YYYY or DD/MM/YYYY
    const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
    match = str.match(dmyRegex);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        return new Date(year, month, day);
    }

    // 3. Check DD-MM-YY or DD/MM/YY
    const dmyShortRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/;
    match = str.match(dmyShortRegex);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = parseInt(match[3], 10);
        year = year < 50 ? 2000 + year : 1900 + year;
        return new Date(year, month, day);
    }

    const parsedDate = new Date(str);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
};

// Check if two dates represent the same calendar day (ignoring time)
const datesAreEqual = (date1, date2) => {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;

    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

// Format Date object to DD/MM/YY
const formatDateToDDMMYY = (date) => {
    if (!date) return "N/A";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Invalid Date";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
};

// Format Date object to YYYY/MM/DD
const formatDateToYYYYMMDD = (date) => {
    if (!date) return "N/A";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Invalid Date";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}/${month}/${day}`;
};

async function run() {
    const defaultFiles = [
        path.join(__dirname, "../Invoice Details 2023-2024.xlsx"),
        path.join(__dirname, "../Invoice Details 2025.xlsx"),
        path.join(__dirname, "../Invoice Details 2026.xlsx")
    ];

    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const missingInvoices = [];
        const updatedInvoices = [];
        let totalProcessed = 0;
        let totalCorrect = 0;
        let totalSkippedEmpty = 0;
        
        const filesSummary = [];

        for (const filePath of defaultFiles) {
            console.log(`\n--------------------------------------------`);
            console.log(`Processing file: ${path.basename(filePath)}`);
            if (!fs.existsSync(filePath)) {
                console.warn(`[WARNING] File does not exist: ${filePath}. Skipping.`);
                continue;
            }

            console.log("Reading Excel workbook...");
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet);
            console.log(`Found ${rows.length} rows in Excel sheet.`);

            if (rows.length === 0) continue;

            let dateKey = null;
            let dueDateKey = null;
            let invoiceNumKey = null;

            // Auto-detect columns
            const sampleRow = rows[0];
            const keys = Object.keys(sampleRow);
            
            dateKey = keys.find(k => k.trim().toLowerCase() === 'date' || k.trim().toLowerCase() === 'invoice_date' || k.trim().toLowerCase() === 'invoice date');
            dueDateKey = keys.find(k => k.trim().toLowerCase() === 'due_date' || k.trim().toLowerCase() === 'due date');
            invoiceNumKey = keys.find(k => k.trim().toLowerCase() === 'invoice_number' || k.trim().toLowerCase() === 'invoice number');

            if (!dateKey || !dueDateKey || !invoiceNumKey) {
                for (let i = 0; i < Math.min(rows.length, 5); i++) {
                    const r = rows[i];
                    const rValues = Object.values(r).map(v => String(v).trim().toLowerCase());
                    if (rValues.includes("date") && rValues.includes("invoice_number")) {
                        const rowKeys = Object.keys(r);
                        for (const key of rowKeys) {
                            const val = String(r[key]).trim().toLowerCase();
                            if (val === 'date' || val === 'invoice_date' || val === 'invoice date') dateKey = key;
                            else if (val === 'due_date' || val === 'due date') dueDateKey = key;
                            else if (val === 'invoice_number' || val === 'invoice number') invoiceNumKey = key;
                        }
                        break;
                    }
                }
            }

            if (!dateKey) dateKey = "__EMPTY";
            if (!dueDateKey) dueDateKey = "__EMPTY_1";
            if (!invoiceNumKey) invoiceNumKey = "__EMPTY_2";

            console.log(`Mapped Keys -> Date: "${dateKey}", Due Date: "${dueDateKey}", Invoice Number: "${invoiceNumKey}"`);

            // Extract all non-empty invoice numbers
            const excelInvoiceNumbers = [];
            for (const row of rows) {
                const rawInvNum = row[invoiceNumKey];
                const rawDate = row[dateKey];
                if (String(rawInvNum).trim().toLowerCase() === 'invoice_number' || String(rawDate).trim().toLowerCase() === 'date') {
                    continue;
                }
                if (rawInvNum) {
                    excelInvoiceNumbers.push(String(rawInvNum).trim());
                }
            }

            console.log(`Querying database for ${excelInvoiceNumbers.length} invoice numbers in batch...`);
            const dbInvoicesMap = new Map();
            const chunkSize = 5000;
            for (let i = 0; i < excelInvoiceNumbers.length; i += chunkSize) {
                const chunk = excelInvoiceNumbers.slice(i, i + chunkSize);
                const docs = await Invoice.find({ invoiceNumber: { $in: chunk }, isDeleted: false }).lean();
                for (const doc of docs) {
                    dbInvoicesMap.set(doc.invoiceNumber, doc);
                }
            }
            console.log(`Found ${dbInvoicesMap.size} matching invoices in the database.`);

            const bulkOps = [];
            let fileProcessed = 0;
            let fileCorrect = 0;
            let fileUpdated = 0;
            let fileMissing = 0;
            let fileSkippedEmpty = 0;

            for (const row of rows) {
                const rawInvNum = row[invoiceNumKey];
                const rawDate = row[dateKey];
                const rawDueDate = row[dueDateKey];

                if (String(rawInvNum).trim().toLowerCase() === 'invoice_number' || String(rawDate).trim().toLowerCase() === 'date') {
                    continue;
                }

                if (!rawInvNum) {
                    fileSkippedEmpty++;
                    continue;
                }

                const invNum = String(rawInvNum).trim();
                fileProcessed++;

                const dbInv = dbInvoicesMap.get(invNum);
                if (!dbInv) {
                    fileMissing++;
                    missingInvoices.push({
                        invoiceNumber: invNum,
                        excelDate: rawDate,
                        excelDueDate: rawDueDate,
                        sourceFile: path.basename(filePath)
                    });
                    continue;
                }

                const excelDate = parseFlexibleDate(rawDate);
                const excelDueDate = parseFlexibleDate(rawDueDate);

                if (!excelDate || !excelDueDate) {
                    console.warn(`[WARNING] Row with Invoice ${invNum} has invalid date format: Date=${rawDate}, DueDate=${rawDueDate}`);
                    continue;
                }

                const dateMatches = datesAreEqual(dbInv.generatedAt, excelDate);
                const dueDateMatches = datesAreEqual(dbInv.dueDate, excelDueDate);

                if (dateMatches && dueDateMatches) {
                    fileCorrect++;
                    continue;
                }

                bulkOps.push({
                    updateOne: {
                        filter: { _id: dbInv._id },
                        update: {
                            $set: {
                                generatedAt: excelDate,
                                dueDate: excelDueDate
                            }
                        }
                    }
                });

                fileUpdated++;
                updatedInvoices.push({
                    invoiceNumber: invNum,
                    sourceFile: path.basename(filePath),
                    oldDate: dbInv.generatedAt,
                    newDate: excelDate,
                    oldDueDate: dbInv.dueDate,
                    newDueDate: excelDueDate
                });
            }

            if (bulkOps.length > 0) {
                console.log(`Executing bulkWrite for ${bulkOps.length} updates...`);
                for (let i = 0; i < bulkOps.length; i += chunkSize) {
                    const chunk = bulkOps.slice(i, i + chunkSize);
                    const result = await Invoice.bulkWrite(chunk, { ordered: false });
                    console.log(`Chunk updated: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
                }
            }

            totalProcessed += fileProcessed;
            totalCorrect += fileCorrect;
            totalSkippedEmpty += fileSkippedEmpty;

            filesSummary.push({
                fileName: path.basename(filePath),
                processed: fileProcessed,
                correct: fileCorrect,
                updated: fileUpdated,
                missing: fileMissing,
                skippedEmpty: fileSkippedEmpty
            });
        }

        // Generate Markdown Report for all three files
        const reportPath = path.join(__dirname, "../non_identified_invoices.md");
        let mdContent = `# Non-Identified and Missing Invoices Report\n\n`;
        mdContent += `Generated on: ${new Date().toLocaleString()}\n`;
        mdContent += `Files Analyzed:\n`;
        for (const summary of filesSummary) {
            mdContent += `- \`${summary.fileName}\`\n`;
        }
        mdContent += `\n## Summary of Operations Across Files\n\n`;
        mdContent += `| File Name | Total Processed | Already Correct | Updated | Non-Identified (Missing) | Empty Rows |\n`;
        mdContent += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
        for (const summary of filesSummary) {
            mdContent += `| \`${summary.fileName}\` | ${summary.processed} | ${summary.correct} | ${summary.updated} | **${summary.missing}** | ${summary.skippedEmpty} |\n`;
        }
        mdContent += `| **Combined Total** | **${totalProcessed}** | **${totalCorrect}** | **${updatedInvoices.length}** | **${missingInvoices.length}** | **${totalSkippedEmpty}** |\n\n`;

        if (missingInvoices.length > 0) {
            mdContent += `## Non-Identified Invoices\n\n`;
            mdContent += `The following invoices were present in the Excel sheets but could not be identified/found in the database:\n\n`;
            mdContent += `| Source File | Invoice Number | Excel Date (YYYY/MM/DD) | Excel Date (DD/MM/YY) | Excel Due Date (YYYY/MM/DD) | Excel Due Date (DD/MM/YY) |\n`;
            mdContent += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
            for (const item of missingInvoices) {
                const parsedD = parseFlexibleDate(item.excelDate);
                const parsedDD = parseFlexibleDate(item.excelDueDate);
                
                const ymdDate = formatDateToYYYYMMDD(parsedD) || String(item.excelDate);
                const dmyDate = formatDateToDDMMYY(parsedD) || "N/A";
                
                const ymdDueDate = formatDateToYYYYMMDD(parsedDD) || String(item.excelDueDate);
                const dmyDueDate = formatDateToDDMMYY(parsedDD) || "N/A";

                mdContent += `| \`${item.sourceFile}\` | **${item.invoiceNumber}** | ${ymdDate} | ${dmyDate} | ${ymdDueDate} | ${dmyDueDate} |\n`;
            }
        } else {
            mdContent += `## Non-Identified Invoices\n\n`;
            mdContent += `All invoices processed from the Excel sheets were successfully found and matched in the database!\n`;
        }

        fs.writeFileSync(reportPath, mdContent, "utf8");
        console.log(`\nMarkdown report successfully written to: ${reportPath}`);

        // Print final status summary
        console.log("\n================ COMBINED SUMMARY ================");
        console.log(`Total Rows Processed:           ${totalProcessed}`);
        console.log(`Already Correct (Skipped):      ${totalCorrect}`);
        console.log(`Total Updated Invoices:         ${updatedInvoices.length}`);
        console.log(`Total Non-Identified (Missing): ${missingInvoices.length}`);
        console.log(`Total Rows without Inv Num:     ${totalSkippedEmpty}`);
        console.log("==================================================\n");

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("Execution failed with error:", err);
        process.exit(1);
    }
}

run();

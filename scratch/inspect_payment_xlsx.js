const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'PaymentPart1.0.xlsx');
try {
    const workbook = XLSX.readFile(filePath);
    console.log("Sheet names:", workbook.SheetNames);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log("Headers (first 2 rows):", jsonData.slice(0, 2));
} catch (e) {
    console.error("Error reading file:", e);
}

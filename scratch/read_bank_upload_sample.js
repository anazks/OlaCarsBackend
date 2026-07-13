const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "../BANK UPLOAD SAMPLE (1).xlsx");
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Raw Header Row (Row 1):", rawRows[0]);
console.log("Raw Data Row (Row 2):", rawRows[1]);

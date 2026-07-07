const XLSX = require('xlsx');
const path = require('path');

const csvPath = path.join(__dirname, '../Customer_Payment00.csv');
console.log("Reading CSV from:", csvPath);

const workbook = XLSX.readFile(csvPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Headers:");
console.log(data[0]);

console.log("\nRow 1:");
console.log(data[1]);

console.log("\nRow 2:");
console.log(data[2]);

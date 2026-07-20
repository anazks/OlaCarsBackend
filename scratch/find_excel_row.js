const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "../Invoice Details 2026.xlsx");

try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    
    const matched = rows.filter(r => r["__EMPTY_2"] && r["__EMPTY_2"].toString().includes("INV-1155"));
    console.log("Matched rows in Excel:", matched);
} catch (err) {
    console.error(err);
}

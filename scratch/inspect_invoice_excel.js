const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "../Invoice Details 2026.xlsx");

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Read raw rows
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log("Total rows found in file:", rows.length);
    
    if (rows.length > 0) {
        console.log("\n--- HEADERS IN EXCEL FILE ---");
        console.log(Object.keys(rows[0]));
        
        // Let's filter some rows that have actual data and print their values
        const samples = rows.slice(0, 50).map(r => ({
            date: r["__EMPTY"],
            due_date: r["__EMPTY_1"],
            invoice_number: r["__EMPTY_2"]
        }));
        console.log("\n--- FIRST 50 ROWS ---");
        console.log(samples);
    }
} catch (err) {
    console.error("Failed to read file:", err.message);
}

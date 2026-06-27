const XLSX = require("xlsx");
const path = require("path");

const filePath = "/Users/pramodgopinath/Downloads/sampleFixedassest.xlsx";

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
        
        console.log("\n--- FIRST ROW VALUES ---");
        console.log(JSON.stringify(rows[0], null, 2));
    }
} catch (err) {
    console.error("Failed to read file:", err.message);
}

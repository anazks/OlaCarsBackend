const XLSX = require("xlsx");

const filePath = "/Users/pramodgopinath/Documents/Ola_Cars/OlaCarsBackend/Fixed_Asset (2).xlsx";

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);
    
    console.log("Total raw rows in Excel:", rawRows.length);
    
    console.log("\n--- HEADERS IN EXCEL ---");
    console.log(Object.keys(rawRows[0]));

    console.log("\n--- ROW 2 (EXCEL ROW 2) ---");
    console.log(JSON.stringify(rawRows[0], null, 2));

    console.log("\n--- ROW 554 (EXCEL ROW 554) ---");
    console.log(JSON.stringify(rawRows[552], null, 2));

} catch (err) {
    console.error(err);
}

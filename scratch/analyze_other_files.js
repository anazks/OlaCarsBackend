const path = require('path');
const fs = require('fs');

const xlsxPath = path.resolve(__dirname, '../../olaCarsFrontEnd/node_modules/xlsx');
let XLSX = require(xlsxPath);

const files = [
    '/Users/pramodgopinath/Downloads/first100.xlsx',
    '/Users/pramodgopinath/Downloads/second100.xlsx',
    '/Users/pramodgopinath/Downloads/3rd200.xlsx',
    '/Users/pramodgopinath/Downloads/first400.xlsx',
    '/Users/pramodgopinath/Downloads/400to1400.xlsx'
];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.log(`\nFile not found: ${filePath}`);
        return;
    }

    console.log(`\n=============================================`);
    console.log(`File: ${filePath}`);
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);
        console.log(`Row count: ${rows.length}`);
        if (rows.length > 0) {
            console.log(`Columns (first 10):`, Object.keys(rows[0]).slice(0, 10));
        }
    } catch (err) {
        console.error(`Error parsing:`, err.message);
    }
});

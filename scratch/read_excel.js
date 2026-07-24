const path = require('path');
const fs = require('fs');

async function inspectExcel() {
    try {
        const xlsx = require('xlsx');
        const filePath = path.join(__dirname, '..', 'invoiceDevitot.xlsx');
        console.log('Reading file:', filePath);
        const workbook = xlsx.readFile(filePath);
        console.log('Sheet Names:', workbook.SheetNames);

        workbook.SheetNames.forEach(sheetName => {
            console.log(`\n--- Sheet: ${sheetName} ---`);
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            console.log('Total Rows:', data.length);
            data.slice(0, 10).forEach((row, idx) => {
                console.log(`Row ${idx}:`, JSON.stringify(row));
            });
        });
    } catch (err) {
        console.error('Error reading excel:', err);
    }
}

inspectExcel();

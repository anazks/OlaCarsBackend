const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../otherDue.xlsx');
const wb = xlsx.readFile(filePath);
console.log('Sheet names:', wb.SheetNames);

const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws);
console.log('Total rows:', rows.length);
console.log('Column headers:', Object.keys(rows[0] || {}));
console.log('---First 5 rows---');
rows.slice(0, 5).forEach((r, i) => {
    console.log('Row ' + (i + 1) + ':', JSON.stringify(r, null, 2));
});
console.log('---Last 2 rows---');
rows.slice(-2).forEach((r, i) => {
    console.log('Row ' + (rows.length - 1 + i) + ':', JSON.stringify(r, null, 2));
});

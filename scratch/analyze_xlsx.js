const path = require('path');
const fs = require('fs');

const xlsxPath = path.resolve(__dirname, '../../olaCarsFrontEnd/node_modules/xlsx');
let XLSX;
try {
    XLSX = require(xlsxPath);
} catch (e) {
    console.error('Failed to load xlsx from frontend:', e.message);
    process.exit(1);
}

const files = [
    'C:\\Users\\anton\\Downloads\\data_migration_template - ACTIVE DRIVERS.xlsx',
    'C:\\Users\\anton\\Downloads\\no_activation_drivers.xlsx',
    'C:\\Users\\anton\\Downloads\\ActiveDrivers.xlsx',
    'C:\\Users\\anton\\Downloads\\splitExecl.xlsx'
];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.log(`\nFile not found: ${filePath}`);
        return;
    }

    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        console.log(`\n=============================================`);
        console.log(`File: ${path.basename(filePath)}`);
        console.log(`Total rows in Excel: ${rows.length}`);

        if (rows.length === 0) return;

        // Print header columns
        console.log('Columns:', Object.keys(rows[0]));

        // Fields to check for duplicates
        const emails = {};
        const phones = {};
        const vins = {};
        const names = {};
        const regNums = {};

        const emailDuplicates = [];
        const phoneDuplicates = [];
        const vinDuplicates = [];
        const nameDuplicates = [];
        const regNumDuplicates = [];

        rows.forEach((row, index) => {
            const rowNum = index + 2;

            const email = row.email ? String(row.email).trim().toLowerCase() : null;
            if (email) {
                if (emails[email]) emailDuplicates.push({ email, firstRow: emails[email], duplicateRow: rowNum });
                else emails[email] = rowNum;
            }

            const phone = row.phone ? String(row.phone).trim() : null;
            if (phone) {
                if (phones[phone]) phoneDuplicates.push({ phone, firstRow: phones[phone], duplicateRow: rowNum });
                else phones[phone] = rowNum;
            }

            const vin = row.vehicleVin ? String(row.vehicleVin).trim().toUpperCase() : null;
            if (vin) {
                if (vins[vin]) vinDuplicates.push({ vin, firstRow: vins[vin], duplicateRow: rowNum });
                else vins[vin] = rowNum;
            }

            const name = row.fullName ? String(row.fullName).trim().toLowerCase() : null;
            if (name) {
                if (names[name]) nameDuplicates.push({ name, firstRow: names[name], duplicateRow: rowNum });
                else names[name] = rowNum;
            }

            const regNum = row.vehicleNumber ? String(row.vehicleNumber).trim().toUpperCase() : null;
            if (regNum) {
                if (regNums[regNum]) regNumDuplicates.push({ regNum, firstRow: regNums[regNum], duplicateRow: rowNum });
                else regNums[regNum] = rowNum;
            }
        });

        console.log(`Unique emails: ${Object.keys(emails).length} (Duplicates: ${emailDuplicates.length})`);
        console.log(`Unique phones: ${Object.keys(phones).length} (Duplicates: ${phoneDuplicates.length})`);
        console.log(`Unique VINs: ${Object.keys(vins).length} (Duplicates: ${vinDuplicates.length})`);
        console.log(`Unique Names: ${Object.keys(names).length} (Duplicates: ${nameDuplicates.length})`);
        console.log(`Unique Reg Nums: ${Object.keys(regNums).length} (Duplicates: ${regNumDuplicates.length})`);

        if (emailDuplicates.length > 0) console.log('Email duplicates (first 5):', emailDuplicates.slice(0, 5));
        if (phoneDuplicates.length > 0) console.log('Phone duplicates (first 5):', phoneDuplicates.slice(0, 5));
        if (vinDuplicates.length > 0) console.log('VIN duplicates (first 5):', vinDuplicates.slice(0, 5));
        if (nameDuplicates.length > 0) console.log('Name duplicates (first 5):', nameDuplicates.slice(0, 5));
        if (regNumDuplicates.length > 0) console.log('Reg Num duplicates (first 5):', regNumDuplicates.slice(0, 5));

    } catch (e) {
        console.error(`Error reading ${filePath}:`, e.message);
    }
});

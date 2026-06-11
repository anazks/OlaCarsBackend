const path = require('path');
const fs = require('fs');

const xlsxPath = path.resolve(__dirname, '../../olaCarsFrontEnd/node_modules/xlsx');
let XLSX;
try {
    XLSX = require(xlsxPath);
} catch (e) {
    console.error('Failed to load xlsx:', e.message);
    process.exit(1);
}

// Replicate frontend parser from BulkInventoryUpload.tsx
const parse2DArrayToObjects = (aoa) => {
    if (!aoa || aoa.length === 0) return [];

    const targetHeaders = ['item name', 'sku', 'item id', 'rate', 'part number', 'partname'];
    let headerRowIdx = -1;

    for (let i = 0; i < aoa.length; i++) {
        const row = aoa[i];
        if (Array.isArray(row)) {
            const hasHeader = row.some(cell => {
                if (cell === undefined || cell === null) return false;
                const cleanCell = String(cell).trim().toLowerCase();
                return targetHeaders.includes(cleanCell);
            });
            if (hasHeader) {
                headerRowIdx = i;
                break;
            }
        }
    }

    if (headerRowIdx === -1) {
        headerRowIdx = 0;
    }

    const rawHeaders = aoa[headerRowIdx];
    const headers = rawHeaders.map((h) => h !== undefined && h !== null ? String(h).trim() : '');

    const resultObjects = [];
    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
        const row = aoa[i];
        if (!row || row.length === 0) continue;

        const isEmpty = row.every((cell) => cell === undefined || cell === null || String(cell).trim() === '');
        if (isEmpty) continue;

        const obj = {};
        headers.forEach((header, colIdx) => {
            if (header) {
                obj[header] = row[colIdx];
            }
        });
        resultObjects.push(obj);
    }

    return { resultObjects, headerRowIdx, headers };
};

const files = [
    '/Users/pramodgopinath/Downloads/Item.xlsx',
    '/Users/pramodgopinath/Downloads/Item (1).xlsx',
    '/Users/pramodgopinath/Downloads/item-list (1).xlsx'
];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        return;
    }

    console.log(`\n=============================================`);
    console.log(`File: ${filePath}`);
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Standard sheet_to_json
        const standardRows = XLSX.utils.sheet_to_json(sheet);
        console.log(`Standard sheet_to_json row count: ${standardRows.length}`);

        // AOA sheet_to_json
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`AOA sheet_to_json length: ${aoa.length}`);

        // Custom parser
        const { resultObjects, headerRowIdx, headers } = parse2DArrayToObjects(aoa);
        console.log(`Custom parse2DArrayToObjects count: ${resultObjects.length}`);
        console.log(`Detected headerRowIdx: ${headerRowIdx}`);
        console.log(`Detected headers count: ${headers.length}`);
        console.log(`Headers:`, headers.slice(0, 10), '...');

        if (resultObjects.length > 0) {
            // Check for duplicate SKUs / Item Names in parsed objects
            const skus = {};
            const itemNames = {};
            const skuDuplicates = [];
            const nameDuplicates = [];

            resultObjects.forEach((obj, idx) => {
                const rowNum = idx + headerRowIdx + 2;
                
                // Fields mapping in BulkInventoryUpload.tsx
                const skuVal = obj['SKU'] || obj['Item ID'] || obj['partNumber'] || obj['part number'] || obj['sku'] || obj['Part Number'];
                const nameVal = obj['Item Name'] || obj['CF.Item Name'] || obj['item name'] || obj['partName'] || obj['part name'] || obj['ItemName'];

                const sku = skuVal ? String(skuVal).trim().toUpperCase() : null;
                const name = nameVal ? String(nameVal).trim().toLowerCase() : null;

                if (sku) {
                    if (skus[sku]) skuDuplicates.push({ sku, firstRow: skus[sku], duplicateRow: rowNum });
                    else skus[sku] = rowNum;
                }
                if (name) {
                    if (itemNames[name]) nameDuplicates.push({ name, firstRow: itemNames[name], duplicateRow: rowNum });
                    else itemNames[name] = rowNum;
                }
            });

            console.log(`Unique SKUs in parsed objects: ${Object.keys(skus).length} (Duplicate SKU rows: ${skuDuplicates.length})`);
            console.log(`Unique Item Names in parsed objects: ${Object.keys(itemNames).length} (Duplicate Name rows: ${nameDuplicates.length})`);
            
            if (skuDuplicates.length > 0) {
                console.log('Sample Duplicate SKUs (first 5):', skuDuplicates.slice(0, 5));
            }
        }
    } catch (err) {
        console.error(`Error parsing file:`, err.message);
    }
});

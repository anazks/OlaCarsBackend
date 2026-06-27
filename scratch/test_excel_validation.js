const XLSX = require("xlsx");

const filePath = "/Users/pramodgopinath/Downloads/sampleFixedassest.xlsx";

const parseFlexibleDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
        const d = new Date((val - 25569) * 86400 * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    const str = String(val).trim();
    if (!str) return null;
    const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
        if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
};

const parseFlexibleDateString = (val) => {
    const d = parseFlexibleDate(val);
    return d ? d.toISOString().split('T')[0] : '';
};

const parseNumber = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/[$,\s]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
};

const validateRow = (row) => {
    const errors = [];
    if (!row.name || !String(row.name).trim()) {
        errors.push('Missing Fixed Asset Name');
    }
    if (!row.code || !String(row.code).trim()) {
        errors.push('Missing Fixed Asset Number');
    }
    if (!row.purchaseDate || !String(row.purchaseDate).trim()) {
        errors.push('Missing Purchase Date');
    } else {
        const date = new Date(row.purchaseDate);
        if (isNaN(date.getTime())) {
            errors.push('Invalid Purchase Date');
        }
    }
    if (row.purchasePrice === undefined || row.purchasePrice === null || isNaN(row.purchasePrice) || row.purchasePrice <= 0) {
        errors.push('Missing or invalid Purchase Value');
    }
    if (!row.fixedAssetAccount || !String(row.fixedAssetAccount).trim()) {
        errors.push('Missing Fixed Asset Account');
    }
    if (!row.depreciationExpenseAccount || !String(row.depreciationExpenseAccount).trim()) {
        errors.push('Missing Expense Account');
    }
    if (!row.accumulatedDepreciationAccount || !String(row.accumulatedDepreciationAccount).trim()) {
        errors.push('Missing Depreciation Account');
    }
    return errors;
};

const mapHeaders = (row) => {
    const mapped = {};
    for (const key of Object.keys(row)) {
        const normalizedKey = key.trim().toLowerCase();
        const val = row[key];
        if (normalizedKey === 'fixed asset name' || normalizedKey === 'asset name' || normalizedKey === 'name') {
            mapped.name = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'fixed asset number' || normalizedKey === 'asset number' || normalizedKey === 'code') {
            mapped.code = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'status') {
            mapped.status = val !== undefined && val !== null ? String(val).trim() : 'Active';
        } else if (normalizedKey === 'fixed asset type' || normalizedKey === 'asset type') {
            mapped.fixedAssetType = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'purchase date') {
            mapped.purchaseDate = parseFlexibleDateString(val);
        } else if (normalizedKey === 'purchase value' || normalizedKey === 'purchase price') {
            mapped.purchasePrice = parseNumber(val);
        } else if (normalizedKey === 'purchase quantity') {
            mapped.purchaseQuantity = parseNumber(val) || 1;
        } else if (normalizedKey === 'current quantity') {
            mapped.currentQuantity = parseNumber(val) || 1;
        } else if (normalizedKey === 'depreciation start value') {
            mapped.depreciationStartValue = parseNumber(val);
        } else if (normalizedKey === 'current value') {
            mapped.currentValue = parseNumber(val);
        } else if (normalizedKey === 'notes') {
            mapped.notes = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'asset life') {
            mapped.assetLife = parseNumber(val);
        } else if (normalizedKey === 'asset life basis' || normalizedKey === 'asset life unit') {
            mapped.assetLifeUnit = val;
        } else if (normalizedKey === 'warranty expiry date' || normalizedKey === 'warranty expiration date') {
            mapped.warrantyExpirationDate = parseFlexibleDateString(val) || undefined;
        } else if (normalizedKey === 'description') {
            mapped.description = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'serial number') {
            mapped.serialNumber = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'disposal value') {
            mapped.disposalValue = parseNumber(val) || 0;
        } else if (normalizedKey === 'asset number prefix') {
            mapped.assetNumberPrefix = val;
        } else if (normalizedKey === 'asset number suffix') {
            mapped.assetNumberSuffix = val;
        } else if (normalizedKey === 'depreciation start date') {
            mapped.depreciationStartDate = parseFlexibleDateString(val);
        } else if (normalizedKey === 'depreciation method') {
            mapped.depreciationMethod = val;
        } else if (normalizedKey === 'computation type') {
            mapped.computationType = val;
        } else if (normalizedKey === 'depreciation frequency' || normalizedKey === 'depreciation interval') {
            mapped.depreciationInterval = val;
        } else if (normalizedKey === 'fixed asset account') {
            mapped.fixedAssetAccount = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'expense account') {
            mapped.depreciationExpenseAccount = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'depreciation account') {
            mapped.accumulatedDepreciationAccount = val !== undefined && val !== null ? String(val).trim() : '';
        } else if (normalizedKey === 'location id') {
            mapped.locationId = val;
        } else if (normalizedKey === 'location name' || normalizedKey === 'location') {
            mapped.locationName = val !== undefined && val !== null ? String(val).trim() : '';
        }
    }
    return mapped;
};

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);

    console.log("Validating raw rows...");
    rawRows.forEach((rawRow, index) => {
        const mapped = mapHeaders(rawRow);
        const errors = validateRow(mapped);
        console.log(`\nRow ${index + 2} (${mapped.code || 'No Code'}):`);
        console.log("  Errors:", errors.length > 0 ? errors.join(', ') : "None");
        console.log("  Mapped Row details:", JSON.stringify(mapped, null, 2));
    });
} catch (err) {
    console.error(err);
}

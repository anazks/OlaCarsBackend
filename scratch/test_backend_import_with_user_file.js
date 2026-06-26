const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const XLSX = require("xlsx");

dotenv.config({ path: path.join(__dirname, "../.env") });

const filePath = "/Users/pramodgopinath/Documents/Ola_Cars/OlaCarsBackend/Fixed_Asset (2).xlsx";

const FixedAssetService = require("../Src/modules/FixedAsset/Service/FixedAssetService");
const FixedAsset = require("../Src/modules/FixedAsset/Model/FixedAssetModel");

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

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB.");

        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet);

        const mappedPayload = rawRows.map(mapHeaders);

        // Delete test assets from the database so they aren't duplicate skipped
        const codes = mappedPayload.map(p => p.code).filter(Boolean);
        await FixedAsset.deleteMany({ code: { $in: codes } });
        console.log("Cleaned up assets matching codes:", codes);

        const userData = {
            id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
            role: "ADMIN"
        };

        console.log("\nCalling FixedAssetService.bulkImportFixedAssets...");
        const result = await FixedAssetService.bulkImportFixedAssets(mappedPayload, userData);

        console.log("\n--- SERVICE RESPONSE ---");
        console.log("Created count:", result.created.length);
        console.log("Duplicates count:", result.duplicates.length);
        console.log("Errors count:", result.errors.length);

        if (result.errors.length > 0) {
            console.log("\nError details:");
            result.errors.forEach(e => {
                console.log(`  Row ${e.row} (${e.code || 'No Code'}): ${e.reason}`);
            });
        }

        if (result.created.length > 0) {
            console.log("\n--- DB VERIFICATION CHECK ---");
            const testAssetCode = result.created[0].code;
            const assetInDb = await FixedAsset.findOne({ code: testAssetCode });
            console.log(`Loaded asset from DB: "${assetInDb.name}" (Code: ${assetInDb.code})`);
            console.log(`- Purchase Price: ${assetInDb.purchasePrice}`);
            console.log(`- Current Value in DB: ${assetInDb.currentValue}`);
            console.log(`- Schedule size: ${assetInDb.depreciationSchedule?.length || 0}`);
            
            if (assetInDb.depreciationSchedule && assetInDb.depreciationSchedule.length > 0) {
                const postedPeriods = assetInDb.depreciationSchedule.filter(p => p.status === "Posted");
                const pendingPeriods = assetInDb.depreciationSchedule.filter(p => p.status === "Pending");
                console.log(`- Posted Periods: ${postedPeriods.length}`);
                console.log(`- Pending Periods: ${pendingPeriods.length}`);
                
                if (postedPeriods.length > 0) {
                    const lastPosted = postedPeriods[postedPeriods.length - 1];
                    console.log(`- Last Posted Period Index: ${lastPosted.periodIndex}`);
                    console.log(`- Last Posted Period Date: ${lastPosted.periodDate.toISOString().split('T')[0]}`);
                    console.log(`- Last Posted Book Value: ${lastPosted.bookValue}`);
                    console.log(`- Does currentValue equal last posted book value? ${assetInDb.currentValue === lastPosted.bookValue ? 'YES (CORRECT)' : 'NO (INCORRECT)'}`);
                    console.log(`- Are posted periods missing ledgerEntry references? ${postedPeriods.every(p => !p.ledgerEntry) ? 'YES (CORRECT)' : 'NO (INCORRECT)'}`);
                }
            }

            // Verify no ledger entries are created in DB
            const ledgerEntryCount = await mongoose.connection.db.collection("ledgerentries").countDocuments({});
            console.log(`- Total LedgerEntries in DB: ${ledgerEntryCount}`);
        }

    } catch (err) {
        console.error("Simulation crashed:", err);
    } finally {
        await mongoose.connection.close();
    }
}

run();

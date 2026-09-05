const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const xlsx = require('xlsx');

dotenv.config({ path: path.join(__dirname, '../.env') });
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

function normalize(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripPlate(str) {
    if (!str) return '';
    let s = normalize(str);
    s = s.replace(/\b[A-Z]{2}\s*\d{3,5}\b/g, '').trim();
    return s.replace(/\s+/g, ' ').trim();
}

async function main() {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;

    // 1. Fetch Drivers ONLY
    const drivers = await db.collection('drivers').find({}, {
        projection: {
            'personalInfo.fullName': 1,
            driverId: 1,
            status: 1,
            isDeleted: 1
        }
    }).toArray();

    // 2. Fetch Customers
    const customers = await db.collection('customers').find({}, {
        projection: {
            name: 1,
            companyName: 1,
            firstName: 1,
            lastName: 1,
            driver: 1,
            isDeleted: 1
        }
    }).toArray();

    console.log(`DB Counts: Drivers = ${drivers.length}, Customers = ${customers.length}`);

    // Build Driver sets
    const driverExactNames = new Set();
    const driverStrippedNames = new Set();
    const driverIdSet = new Set();

    drivers.forEach(d => {
        const full = normalize(d.personalInfo?.fullName);
        const stripped = stripPlate(d.personalInfo?.fullName);
        if (full) driverExactNames.add(full);
        if (stripped) driverStrippedNames.add(stripped);
        if (d.driverId) driverIdSet.add(normalize(d.driverId));
    });

    // Build Customer sets (All customers vs Customers with driver ref)
    const customerNamesAll = new Set();
    const customerNamesWithDriverRef = new Set();

    customers.forEach(c => {
        const n = normalize(c.name || c.companyName || `${c.firstName || ''} ${c.lastName || ''}`);
        const stripped = stripPlate(c.name || c.companyName || `${c.firstName || ''} ${c.lastName || ''}`);
        if (n) customerNamesAll.add(n);
        if (stripped) customerNamesAll.add(stripped);

        if (c.driver) {
            if (n) customerNamesWithDriverRef.add(n);
            if (stripped) customerNamesWithDriverRef.add(stripped);
        }
    });

    // Read Excel
    const excelPath = path.join(__dirname, '../FindunKnownCustomers.xlsx');
    const wb = xlsx.readFile(excelPath);
    const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });

    const headers = data[0];
    const driverColIdx = headers.indexOf('DRIVER NAME');
    const remarksColIdx = headers.indexOf('REMARKS');
    const descColIdx = headers.indexOf('DESCRIPTION');
    const numberColIdx = headers.indexOf('NUMBER');
    const prefixColIdx = headers.indexOf('PREFIX');
    const accountsColIdx = headers.indexOf('ACCOUNTS NAME');
    const receiptColIdx = headers.indexOf('RECEIPT');

    console.log(`Excel Headers:`, headers);

    // Let's analyze all distinct values in DRIVER NAME column
    const uniqueExcelDrivers = new Map(); // rawName -> [rowNumbers]

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        const rowNum = i + 1;
        const dVal = row[driverColIdx];
        if (dVal && String(dVal).trim() && String(dVal).trim().toLowerCase() !== 'undefined') {
            const raw = String(dVal).trim();
            if (!uniqueExcelDrivers.has(raw)) {
                uniqueExcelDrivers.set(raw, []);
            }
            uniqueExcelDrivers.get(raw).push(rowNum);
        }
    }

    console.log(`\nUnique DRIVER NAME strings in Excel: ${uniqueExcelDrivers.size}`);

    // Evaluate each unique Excel driver against DRIVER COLLECTION ONLY
    const inDriverCollection = [];
    const notInDriverCollection = [];

    for (const [rawName, rowNumbers] of uniqueExcelDrivers.entries()) {
        const norm = normalize(rawName);
        const stripped = stripPlate(rawName);

        const inDriversExact = driverExactNames.has(norm) || (stripped && driverExactNames.has(stripped));
        const inDriversStripped = driverStrippedNames.has(norm) || (stripped && driverStrippedNames.has(stripped));
        const inDriverColl = inDriversExact || inDriversStripped;

        const inCustAll = customerNamesAll.has(norm) || (stripped && customerNamesAll.has(stripped));
        const inCustWithDriver = customerNamesWithDriverRef.has(norm) || (stripped && customerNamesWithDriverRef.has(stripped));

        const info = {
            rawName,
            rowNumbers,
            rowCount: rowNumbers.length,
            inDriverColl,
            inCustAll,
            inCustWithDriver
        };

        if (inDriverColl) {
            inDriverCollection.push(info);
        } else {
            notInDriverCollection.push(info);
        }
    }

    console.log(`\n======================================================`);
    console.log(`STRICT CHECK AGAINST 'drivers' COLLECTION ONLY:`);
    console.log(`======================================================`);
    console.log(`Found in 'drivers' collection:     ${inDriverCollection.length} unique driver names (${inDriverCollection.reduce((a, b) => a + b.rowCount, 0)} total rows)`);
    console.log(`NOT found in 'drivers' collection: ${notInDriverCollection.length} unique driver names (${notInDriverCollection.reduce((a, b) => a + b.rowCount, 0)} total rows)`);

    console.log(`\n--- TOP 30 UNIQUE DRIVERS NOT IN 'drivers' COLLECTION ---`);
    notInDriverCollection.slice(0, 30).forEach((item, idx) => {
        console.log(`[${idx + 1}] "${item.rawName}" | Rows (${item.rowCount}): ${item.rowNumbers.slice(0, 5).join(', ')}${item.rowCount > 5 ? '...' : ''} | In Zoho Customers: ${item.inCustAll} | Linked to Driver: ${item.inCustWithDriver}`);
    });

    // Also let's list all rows where DRIVER NAME is in notInDriverCollection
    const notInDriversTotalRows = notInDriverCollection.flatMap(i => i.rowNumbers).sort((a, b) => a - b);
    console.log(`\nAll row numbers NOT found in 'drivers' collection (Total ${notInDriversTotalRows.length} rows):`);
    console.log(notInDriversTotalRows.join(', '));

    await mongoose.disconnect();
}

main().catch(console.error);

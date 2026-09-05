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

    const drivers = await db.collection('drivers').find({}, {
        projection: {
            'personalInfo.fullName': 1,
            'personalInfo.phone': 1,
            driverId: 1,
            status: 1
        }
    }).toArray();

    const driverExactMap = new Map();
    const driverStrippedMap = new Map();

    drivers.forEach(d => {
        const full = normalize(d.personalInfo?.fullName);
        const stripped = stripPlate(d.personalInfo?.fullName);
        if (full) driverExactMap.set(full, d);
        if (stripped) driverStrippedMap.set(stripped, d);
    });

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

    console.log('=== INSPECTING THE 26 ROWS WHERE DRIVER IS NOT IN "drivers" COLLECTION ===\n');

    const targetRowNumbers = [414, 725, 866, 868, 898, 906, 933, 934, 1009, 1061, 1062, 1063, 1064, 1065, 1156, 1157, 1217, 1244, 1245, 1284, 1286, 1287, 1374, 1375, 1376, 1433];

    for (const rNum of targetRowNumbers) {
        const row = data[rNum - 1]; // 0-based
        const driverName = row[driverColIdx];
        const remarks = row[remarksColIdx];
        const desc = row[descColIdx];
        const receipt = row[receiptColIdx];
        const txNum = `${row[prefixColIdx]}${row[numberColIdx]}`;

        // Check if the REMARKS has a driver in DB
        const remNorm = normalize(remarks);
        const remStrip = stripPlate(remarks);
        const remMatch = driverExactMap.get(remNorm) || driverExactMap.get(remStrip) || driverStrippedMap.get(remNorm) || driverStrippedMap.get(remStrip);

        // Check if the DESCRIPTION has a driver in DB
        let descMatch = null;
        for (const [stripName, d] of driverStrippedMap.entries()) {
            if (stripName.length > 5 && normalize(desc).includes(stripName)) {
                descMatch = d;
                break;
            }
        }

        console.log(`Excel Row ${rNum}:`);
        console.log(`  Tx Number:     ${txNum}`);
        console.log(`  Driver Column: "${driverName}"`);
        console.log(`  Receipt:       $${receipt}`);
        console.log(`  Remarks:       "${remarks}" (DB Driver match: ${remMatch ? remMatch.personalInfo?.fullName : 'NONE'})`);
        console.log(`  Description:   "${desc}" (DB Driver match: ${descMatch ? descMatch.personalInfo?.fullName : 'NONE'})`);
        console.log('---');
    }

    // Also check ALFREDO CAMPOS VILLAR in drivers specifically
    console.log('\n--- Searching for ALFREDO CAMPOS VILLAR in drivers ---');
    const alfredo = await db.collection('drivers').find({
        $or: [
            { 'personalInfo.fullName': /ALFREDO|CAMPOS|EW2857/i }
        ]
    }).toArray();
    console.log('Matches for ALFREDO/CAMPOS:', alfredo.map(d => ({ id: d.driverId, name: d.personalInfo?.fullName })));

    await mongoose.disconnect();
}

main().catch(console.error);

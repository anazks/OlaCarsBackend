const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const Customer = require('./Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('./Src/modules/Driver/Model/DriverModel');

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const fileArg = args.find(a => a.startsWith('--file='));
const defaultPath = fs.existsSync(path.join(__dirname, 'atualName.xlsx')) 
    ? path.join(__dirname, 'atualName.xlsx') 
    : path.join(__dirname, 'To change in Software.xlsx');
const filePath = fileArg ? fileArg.split('=')[1] : defaultPath;

/**
 * Finds matching column name ignoring case, underscores, spaces, etc.
 */
function findColumnKey(row, possibleNames) {
    const keys = Object.keys(row);
    for (const name of possibleNames) {
        const cleaned = name.toLowerCase().replace(/[\s_\-\.]+/g, '');
        const matched = keys.find(k => k.toLowerCase().replace(/[\s_\-\.]+/g, '') === cleaned);
        if (matched) return matched;
    }
    return null;
}

async function run() {
    console.log('='.repeat(70));
    console.log(` OlaCars - Customer Name Update Script`);
    console.log(` Mode: ${isDryRun ? 'DRY-RUN (Simulating changes only)' : 'LIVE (Applying changes to database)'}`);
    console.log(` Target File: ${filePath}`);
    console.log('='.repeat(70));

    if (!fs.existsSync(filePath)) {
        console.error(`[ERROR] File not found at path: ${filePath}`);
        process.exit(1);
    }

    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('[ERROR] MONGO_URI is not set in environment or .env file');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri.trim());
    console.log('Connected to MongoDB successfully.\n');

    // Read Excel
    const workbook = xlsx.readFile(filePath);
    // Prefer Sheet1, otherwise use first sheet
    const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    console.log(`Read ${rows.length} rows from sheet "${sheetName}".`);

    if (rows.length === 0) {
        console.log('No data rows found in the sheet. Exiting.');
        await mongoose.disconnect();
        return;
    }

    // Inspect first row to detect column names
    const firstRow = rows[0];
    const custIdCol = findColumnKey(firstRow, ['Customer ID', 'customerId', 'cust_id', 'cust id', 'ID', 'Customer Number']);
    const actualNameCol = findColumnKey(firstRow, ['Actual Names', 'Actual Name', 'actual name', 'actual names', 'Name in Zoho', 'Target Name', 'New Name', 'Names in Zoho', 'Display Name']);
    const currentNameCol = findColumnKey(firstRow, ['Names in Software', 'Name in Software', 'current name', 'Current Name', 'Old Name']);

    console.log(`Detected Columns:`);
    console.log(` - Customer ID Column : "${custIdCol}"`);
    console.log(` - Actual Name Column  : "${actualNameCol}"`);
    if (currentNameCol) console.log(` - Software Name Col   : "${currentNameCol}"`);
    console.log('-'.repeat(70));

    if (!custIdCol || !actualNameCol) {
        console.error(`[ERROR] Could not identify Customer ID and/or Actual Name columns. Available columns:`, Object.keys(firstRow));
        await mongoose.disconnect();
        process.exit(1);
    }

    const stats = {
        total: rows.length,
        alreadyUpToDate: 0,
        updated: 0,
        notFound: 0,
        skippedInvalid: 0,
        errors: 0
    };

    const details = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawCustId = row[custIdCol];
        const rawActualName = row[actualNameCol];
        const rawSoftwareName = currentNameCol ? row[currentNameCol] : null;

        if (!rawCustId || !rawActualName) {
            console.log(`[Row ${i + 1}] Skipping empty Customer ID or Actual Name.`);
            stats.skippedInvalid++;
            continue;
        }

        const customerId = String(rawCustId).trim();
        const actualName = String(rawActualName).trim();
        const softwareName = rawSoftwareName ? String(rawSoftwareName).trim() : null;

        try {
            // Find customer by customerId or customerNumber or _id
            const queryConditions = [{ customerId: customerId }, { customerNumber: customerId }];
            if (mongoose.Types.ObjectId.isValid(customerId)) {
                queryConditions.push({ _id: customerId });
            }

            const customer = await Customer.findOne({ $or: queryConditions, isDeleted: false });

            if (!customer) {
                console.log(`[Row ${i + 1}] [NOT FOUND] Customer ID: ${customerId} (Target Name: "${actualName}")`);
                stats.notFound++;
                details.push({
                    row: i + 1,
                    customerId,
                    targetName: actualName,
                    status: 'NOT FOUND'
                });
                continue;
            }

            let driver = null;
            if (customer.driver) {
                driver = await Driver.findById(customer.driver);
            } else if (customer.email) {
                driver = await Driver.findOne({ 'personalInfo.email': customer.email.toLowerCase(), isDeleted: false });
            }

            const currentCustName = customer.name ? customer.name.trim() : '';
            const currentDriverName = driver && driver.personalInfo && driver.personalInfo.fullName ? driver.personalInfo.fullName.trim() : '';

            const isCustomerNameMatch = currentCustName === actualName;
            const isDriverNameMatch = !driver || currentDriverName === actualName;

            if (isCustomerNameMatch && isDriverNameMatch) {
                stats.alreadyUpToDate++;
                continue;
            }

            // Need update
            console.log(`[Row ${i + 1}] [UPDATE NEEDED] Customer ID: ${customerId}`);
            console.log(`       Old Customer Name : "${currentCustName}"`);
            if (driver) console.log(`       Old Driver Name   : "${currentDriverName}"`);
            console.log(`       New Actual Name   : "${actualName}"`);

            if (!isDryRun) {
                // Update Customer fields
                const updateCustomerFields = {
                    name: actualName
                };
                if (customer.companyName) updateCustomerFields.companyName = actualName;
                if (customer.contactName) updateCustomerFields.contactName = actualName;

                await Customer.findByIdAndUpdate(customer._id, { $set: updateCustomerFields });

                // Update Driver if linked or matched
                if (driver) {
                    await Driver.findByIdAndUpdate(driver._id, {
                        $set: { 'personalInfo.fullName': actualName }
                    });
                    if (!customer.driver) {
                        await Customer.findByIdAndUpdate(customer._id, { $set: { driver: driver._id } });
                    }
                }
                console.log(`       -> Successfully updated in database.`);
            } else {
                console.log(`       -> [DRY-RUN] Would update Customer and Driver to "${actualName}".`);
            }

            stats.updated++;
            details.push({
                row: i + 1,
                customerId,
                oldCustomerName: currentCustName,
                oldDriverName: currentDriverName,
                newActualName: actualName,
                status: isDryRun ? 'WOULD_UPDATE' : 'UPDATED'
            });

        } catch (err) {
            console.error(`[Row ${i + 1}] [ERROR] Failed processing Customer ID: ${customerId}`, err.message);
            stats.errors++;
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(` SUMMARY REPORT`);
    console.log('='.repeat(70));
    console.log(` Total rows processed   : ${stats.total}`);
    console.log(` Already up-to-date     : ${stats.alreadyUpToDate}`);
    console.log(` ${isDryRun ? 'To be updated' : 'Successfully updated'} : ${stats.updated}`);
    console.log(` Customers not found    : ${stats.notFound}`);
    console.log(` Skipped invalid rows   : ${stats.skippedInvalid}`);
    console.log(` Errors encountered     : ${stats.errors}`);
    console.log('='.repeat(70));

    if (details.length > 0) {
        console.log('\nDetailed Changes:');
        console.table(details);
    }

    await mongoose.disconnect();
    console.log('\nDatabase connection closed. Done.');
}

run().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});

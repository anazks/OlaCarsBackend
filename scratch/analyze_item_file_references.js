const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const xlsxPath = path.resolve(__dirname, '../../olaCarsFrontEnd/node_modules/xlsx');
let XLSX = require(xlsxPath);

async function main() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        // Fetch DB entities
        const Branch = require('../Src/modules/Branch/Model/BranchModel');
        const Supplier = require('../Src/modules/Supplier/Model/SupplierModel');
        const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
        const Tax = require('../Src/modules/Tax/Model/TaxModel');

        const dbBranches = await Branch.find({ isDeleted: false, status: "ACTIVE" });
        const dbSuppliers = await Supplier.find({ isDeleted: false, isActive: true });
        const dbAccounts = await AccountingCode.find({ isDeleted: false, isActive: true });
        const dbTaxes = await Tax.find({ isDeleted: false, isActive: true });

        console.log(`\nDB Statistics:`);
        console.log(`- Branches in DB: ${dbBranches.length} (${dbBranches.map(b => b.name).join(', ')})`);
        console.log(`- Suppliers in DB: ${dbSuppliers.length}`);
        console.log(`- Accounts in DB: ${dbAccounts.length}`);
        console.log(`- Taxes in DB: ${dbTaxes.length} (${dbTaxes.map(t => t.name).join(', ')})`);

        // Read XLSX
        const filePath = '/Users/pramodgopinath/Downloads/Item.xlsx';
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        console.log(`\nAnalyzing ${filePath} (${rows.length} rows):`);

        const locations = new Set();
        const vendors = new Set();
        const accounts = new Set();
        const purchaseAccounts = new Set();
        const taxes = new Set();

        rows.forEach(row => {
            if (row['Location Name']) locations.add(row['Location Name']);
            if (row['Vendor']) vendors.add(row['Vendor']);
            if (row['Account Code']) accounts.add(row['Account Code']);
            if (row['Account']) accounts.add(row['Account']);
            if (row['Purchase Account Code']) purchaseAccounts.add(row['Purchase Account Code']);
            if (row['Purchase Account']) purchaseAccounts.add(row['Purchase Account']);
            if (row['Tax Name']) taxes.add(row['Tax Name']);
        });

        console.log(`\nSheet Unique Values:`);
        console.log(`- Location Names:`, Array.from(locations));
        console.log(`- Vendors:`, Array.from(vendors));
        console.log(`- Taxes:`, Array.from(taxes));
        console.log(`- Account Codes/Names (first 10):`, Array.from(accounts).slice(0, 10));
        console.log(`- Purchase Account Codes/Names (first 10):`, Array.from(purchaseAccounts).slice(0, 10));

        // Let's check match rates
        let unmatchedBranches = [];
        locations.forEach(loc => {
            const clean = loc.toLowerCase();
            const matched = dbBranches.find(b => b.name.toLowerCase() === clean || b.code.toLowerCase() === clean);
            if (!matched) unmatchedBranches.push(loc);
        });

        let unmatchedVendors = [];
        vendors.forEach(v => {
            const clean = v.toLowerCase();
            const matched = dbSuppliers.find(s => s.name.toLowerCase() === clean || (s.vendorNumber && s.vendorNumber.toLowerCase() === clean));
            if (!matched) unmatchedVendors.push(v);
        });

        console.log(`\nUnmatched Entities:`);
        console.log(`- Unmatched Branches:`, unmatchedBranches);
        console.log(`- Unmatched Vendors (first 10):`, unmatchedVendors.slice(0, 10), unmatchedVendors.length > 10 ? `... (${unmatchedVendors.length} total)` : '');

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();

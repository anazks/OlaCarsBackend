const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const xlsxPath = path.resolve(__dirname, '../../olaCarsFrontEnd/node_modules/xlsx');
let XLSX = require(xlsxPath);

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const AccountingCode = require('../Src/modules/BranchManager/Model/BranchManagerModel'); // just connect to DB
        const db = mongoose.connection.client.db('olaCarsFresh');

        // Fetch DB accounts
        const accounts = await db.collection('accountingcodes').find({ isDeleted: false, isActive: true }).toArray();

        // System defaults logic from backend
        // We will print what defaults are currently resolved:
        const defaultPurchaseAcc = accounts.find(acc => acc.code === "CGS0001") || accounts.find(acc => acc.category === "Cost Of Goods Sold");
        const defaultIncomeAcc = accounts.find(acc => acc.code === "IN0008") || accounts.find(acc => acc.category === "Income");
        const defaultInvAcc = accounts.find(acc => acc.code === "AST0001") || accounts.find(acc => acc.category === "Stock" || acc.category === "Fixed Asset");

        console.log('--- DB Default Accounts Resolved ---');
        console.log('defaultPurchaseAcc:', defaultPurchaseAcc ? `${defaultPurchaseAcc.code} - ${defaultPurchaseAcc.name}` : 'UNDEFINED');
        console.log('defaultIncomeAcc:', defaultIncomeAcc ? `${defaultIncomeAcc.code} - ${defaultIncomeAcc.name}` : 'UNDEFINED');
        console.log('defaultInvAcc:', defaultInvAcc ? `${defaultInvAcc.code} - ${defaultInvAcc.name}` : 'UNDEFINED');

        // Read XLSX
        const filePath = '/Users/pramodgopinath/Downloads/Item.xlsx';
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const pick = (row, ...keys) => {
            for (const k of keys) {
                if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                    return String(row[k]).trim();
                }
            }
            return undefined;
        };

        let successCount = 0;
        let failCount = 0;
        const failReasons = {};
        const uniqueAccountsUsedInFailedRows = { income: new Set(), purchase: new Set(), inventory: new Set() };

        rows.forEach((row, idx) => {
            const rowNum = idx + 2;

            // Income Account
            let incomeAccountId = undefined;
            const incomeAccVal = pick(row, 'Account Code', 'AccountCode', 'Account', 'account');
            if (incomeAccVal) {
                const cleanCode = incomeAccVal.toLowerCase();
                const matchedAcc = accounts.find(acc => 
                    acc.code.toLowerCase() === cleanCode || 
                    acc.name.toLowerCase() === cleanCode
                );
                if (matchedAcc) {
                    incomeAccountId = matchedAcc._id;
                }
            }
            if (!incomeAccountId && defaultIncomeAcc) {
                incomeAccountId = defaultIncomeAcc._id;
            }

            // Purchase Account
            let purchaseAccountId = undefined;
            const purchaseAccVal = pick(row, 'Purchase Account Code', 'PurchaseAccountCode', 'Purchase Account', 'purchaseAccount');
            if (purchaseAccVal) {
                const cleanCode = purchaseAccVal.toLowerCase();
                const matchedAcc = accounts.find(acc => 
                    acc.code.toLowerCase() === cleanCode || 
                    acc.name.toLowerCase() === cleanCode
                );
                if (matchedAcc) {
                    purchaseAccountId = matchedAcc._id;
                }
            }
            if (!purchaseAccountId && defaultPurchaseAcc) {
                purchaseAccountId = defaultPurchaseAcc._id;
            }

            // Inventory Account
            let inventoryAccountId = undefined;
            const inventoryAccVal = pick(row, 'Inventory Account Code', 'InventoryAccountCode', 'Inventory Account', 'inventoryAccount');
            if (inventoryAccVal) {
                const cleanCode = inventoryAccVal.toLowerCase();
                const matchedAcc = accounts.find(acc => 
                    acc.code.toLowerCase() === cleanCode || 
                    acc.name.toLowerCase() === cleanCode
                );
                if (matchedAcc) {
                    inventoryAccountId = matchedAcc._id;
                }
            }
            if (!inventoryAccountId && defaultInvAcc) {
                inventoryAccountId = defaultInvAcc._id;
            }

            if (!incomeAccountId || !purchaseAccountId || !inventoryAccountId) {
                failCount++;
                let reason = [];
                if (!incomeAccountId) {
                    reason.push(`Income Account ("${incomeAccVal}")`);
                    uniqueAccountsUsedInFailedRows.income.add(incomeAccVal);
                }
                if (!purchaseAccountId) {
                    reason.push(`Purchase Account ("${purchaseAccVal}")`);
                    uniqueAccountsUsedInFailedRows.purchase.add(purchaseAccVal);
                }
                if (!inventoryAccountId) {
                    reason.push(`Inventory Account ("${inventoryAccVal}")`);
                    uniqueAccountsUsedInFailedRows.inventory.add(inventoryAccVal);
                }
                const msg = `Could not resolve: ${reason.join(', ')}`;
                failReasons[msg] = (failReasons[msg] || 0) + 1;
            } else {
                successCount++;
            }
        });

        console.log(`\n--- Simulation Results ---`);
        console.log(`Successfully resolved: ${successCount} rows`);
        console.log(`Failed to resolve: ${failCount} rows`);
        console.log(`\nFailure Reasons Summary:`);
        console.log(JSON.stringify(failReasons, null, 2));

        console.log(`\nUnique Income Accounts in failed rows:`, Array.from(uniqueAccountsUsedInFailedRows.income));
        console.log(`Unique Purchase Accounts in failed rows:`, Array.from(uniqueAccountsUsedInFailedRows.purchase));
        console.log(`Unique Inventory Accounts in failed rows:`, Array.from(uniqueAccountsUsedInFailedRows.inventory));

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();

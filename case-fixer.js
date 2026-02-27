const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dirsToRename = {
    'Src': 'src',
    'AccountingCode': 'accountingCode',
    'Admin': 'admin',
    'Branch': 'branch',
    'BranchManager': 'branchManager',
    'CountryManager': 'countryManager',
    'FinanceAdmin': 'financeAdmin',
    'FinanceStaff': 'financeStaff',
    'Ledger': 'ledger',
    'OperationAdmin': 'operationAdmin',
    'OperationStaff': 'operationStaff',
    'Payment': 'payment',
    'PurchaseOrder': 'purchaseOrder',
    'Supplier': 'supplier',
    'Tax': 'tax',
    'User': 'user',
    'Vehicle': 'vehicle',
    'WorkshopStaff': 'workshopStaff',
    'Model': 'model',
    'Repo': 'repo',
    'Controller': 'controller',
    'Routes': 'routes',
    'Service': 'service',
    'model': 'model' // in case Admin had 'model' lowercased somehow
};

function walkDir(dir, callback) {
    let items = fs.readdirSync(dir);
    items.forEach(f => {
        let dirPath = path.join(dir, f);
        let stat = fs.statSync(dirPath);
        if (stat.isDirectory()) {
            if (f !== 'node_modules' && f !== '.git' && f !== '.vscode' && f !== '.env') {
                callback(dirPath, true);
                walkDir(dirPath, callback);
            }
        } else {
            callback(dirPath, false);
        }
    });
}

// 1. Update file imports
walkDir(process.cwd(), (filePath, isDir) => {
    if (!isDir && filePath.endsWith('.js')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let newContent = content.replace(/(require\(["'])([^"']+)(["']\))/g, (match, p1, p2, p3) => {
            let parts = p2.split('/');
            for (let i = 0; i < parts.length - 1; i++) {
                if (dirsToRename[parts[i]]) {
                    parts[i] = dirsToRename[parts[i]];
                }
            }
            return p1 + parts.join('/') + p3;
        });

        if (content !== newContent) {
            fs.writeFileSync(filePath, newContent);
            console.log("Updated imports in", filePath);
        }
    }
});

// 2. Rename directories bottom-up
let dirs = [];
walkDir(process.cwd(), (filePath, isDir) => {
    if (isDir) {
        dirs.push(filePath);
    }
});

// Sort by length descending to process deepest folders first
dirs.sort((a, b) => b.length - a.length);

dirs.forEach(dir => {
    let basename = path.basename(dir);
    if (dirsToRename[basename] && dirsToRename[basename] !== basename) {
        let newBasename = dirsToRename[basename];
        let dirname = path.dirname(dir);
        let newPath = path.join(dirname, newBasename);

        try {
            let tempPath = path.join(dirname, basename + "_TEMP_RENAME");
            execSync(`git mv "${dir}" "${tempPath}"`);
            execSync(`git mv "${tempPath}" "${newPath}"`);
            console.log(`Renamed directory ${basename} to ${newBasename}`);
        } catch (e) {
            console.error("Failed to rename", dir, e.message);
        }
    }
});

console.log("Cleanup complete!");

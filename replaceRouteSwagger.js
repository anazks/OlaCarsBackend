const fs = require('fs');
const path = require('path');

const replacements = [
    {
        file: path.join(__dirname, 'Src/modules/CountryManager/Routes/CountryManagerRouter.js'),
        find: /\/api\/countrymanager/g,
        replace: '/api/country-manager'
    },
    {
        file: path.join(__dirname, 'Src/modules/FinanceAdmin/Routes/FinanceAdminRoutes.js'),
        find: /\/api\/financeadmin/g,
        replace: '/api/finance-admin'
    },
    {
        file: path.join(__dirname, 'Src/modules/OperationAdmin/Routes/OperationAdminRoutes.js'),
        find: /\/api\/operationaladmin/g,
        replace: '/api/operational-admin'
    },
    {
        file: path.join(__dirname, 'Src/modules/BranchManager/Routes/BranchManagerRouter.js'),
        find: /\/api\/branchmanager/g,
        replace: '/api/branch-manager'
    },
    {
        file: path.join(__dirname, 'Src/modules/OperationStaff/Routes/OperationStaffRoutes.js'),
        find: /\/api\/operationstaff/g,
        replace: '/api/operation-staff'
    },
    {
        file: path.join(__dirname, 'Src/modules/FinanceStaff/Routes/FinanceStaffRoutes.js'),
        find: /\/api\/financestaff/g,
        replace: '/api/finance-staff'
    },
    {
        file: path.join(__dirname, 'Src/modules/WorkshopStaff/Routes/WorkshopStaffRoutes.js'),
        find: /\/api\/workshopstaff/g,
        replace: '/api/workshop-staff'
    }
];

let changedCount = 0;

replacements.forEach(({ file, find, replace }) => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        if (find.test(content)) {
            content = content.replace(find, replace);
            fs.writeFileSync(file, content, 'utf8');
            console.log(`Updated ${path.basename(file)}`);
            changedCount++;
        } else {
            console.log(`No match in ${path.basename(file)}`);
        }
    } else {
        console.error(`File not found: ${file}`);
    }
});

console.log(`Finished updating ${changedCount} files.`);

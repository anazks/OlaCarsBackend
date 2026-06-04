const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'Src', 'modules', 'Driver', 'Controller', 'DriverController.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove vehicleSellingValue
content = content.replace(/if\s*\(row\.vehicleSellingValue.*?}\s*/gs, function(match) {
    if (match.includes('vehicleUpdateData["basicDetails.sellingValue"]')) return '';
    return match;
});

content = content.replace(/sellingValue:\s*\(row\.vehicleSellingValue.*?undefined\),\s*/gs, '');

// 2. Safely trim properties in dataMigrateDrivers
// We only want to do this in the dataMigrateDrivers function. Let's find it.
let startIdx = content.indexOf('const dataMigrateDrivers = async');
let endIdx = content.indexOf('const payAdditionalPayment = async');
let partToFix = content.substring(startIdx, endIdx);

partToFix = partToFix.replace(/row\.([a-zA-Z0-9_]+)\.trim\(\)/g, 'String(row. || "").trim()');

content = content.substring(0, startIdx) + partToFix + content.substring(endIdx);

// 3. Insert generateMigrationRentPlan
const hookStr = const newDriver = await DriverService.create(driverData);;
const insertStr = const newDriver = await DriverService.create(driverData);

                    // Generate Rent Plan if provided
                    if (row.weeklyRent && row.durationWeeks) {
                        await DriverService.generateMigrationRentPlan(newDriver._id, {
                            weeklyRent: Number(row.weeklyRent),
                            durationWeeks: Number(row.durationWeeks),
                            activationDate: row.activationDate || undefined
                        });
                    };

// Only replace the one inside dataMigrateDrivers!
let hookIdx = content.indexOf(hookStr, startIdx);
if (hookIdx !== -1 && hookIdx < endIdx) {
    content = content.substring(0, hookIdx) + insertStr + content.substring(hookIdx + hookStr.length);
}

fs.writeFileSync(filePath, content);
console.log('Fixed DriverController.js');

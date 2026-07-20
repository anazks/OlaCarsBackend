const fs = require('fs');
const content = fs.readFileSync('c:/Users/anton/OneDrive/Documents/vs coding/olaCarsFrontEnd/src/pages/dashboards/finance/BankAccountLedger.tsx', 'utf8');
const lines = content.split('\n');
let foundFunc = false;
let braceCount = 0;
lines.forEach((line, i) => {
    if (line.includes('const renderDescriptionWithLinks')) {
        foundFunc = true;
    }
    if (foundFunc) {
        console.log(`${i + 1}: ${line}`);
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceCount += openBraces - closeBraces;
        if (line.includes('const renderDescriptionWithLinks') && braceCount === 0) {
            // arrow function on one line or something
        } else if (braceCount <= 0 && i > 600) {
            foundFunc = false;
        }
    }
});

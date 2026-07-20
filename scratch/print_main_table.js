const fs = require('fs');
const content = fs.readFileSync('c:/Users/anton/OneDrive/Documents/vs coding/olaCarsFrontEnd/src/pages/dashboards/finance/BankAccountLedger.tsx', 'utf8');
const lines = content.split('\n');
let foundTable = false;
let openCount = 0;
lines.forEach((line, i) => {
    if (line.includes('<table') && !line.includes('Bulk Edit')) {
        foundTable = true;
    }
    if (foundTable) {
        console.log(`${i + 1}: ${line}`);
        if (line.includes('<table')) openCount++;
        if (line.includes('</table>')) {
            openCount--;
            if (openCount === 0) foundTable = false;
        }
    }
});

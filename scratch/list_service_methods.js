const fs = require('fs');
const content = fs.readFileSync('c:/Users/anton/OneDrive/Documents/vs coding/OlaCarsBackend/Src/modules/BankAccount/Service/BankAccountService.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('bulkEdit') || line.includes('bulkEditTransactions') || line.includes('editTransactions')) {
        console.log(`${i + 1}: ${line.trim()}`);
    }
});

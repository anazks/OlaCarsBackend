const fs = require('fs');
const content = fs.readFileSync('c:/Users/anton/OneDrive/Documents/vs coding/OlaCarsBackend/Src/modules/BankAccount/Controller/BankAccountController.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('bulk') || line.includes('transactions') || line.includes('edit')) {
        console.log(`${i + 1}: ${line.trim()}`);
    }
});

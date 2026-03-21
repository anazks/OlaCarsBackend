const fs = require('fs');
fs.writeFileSync('test_output.txt', 'Node is working at ' + new Date().toISOString());
console.log('Test file written');
process.exit(0);

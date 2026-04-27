const fs = require('fs');
const path = require('path');

function walkSync(currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach(function (name) {
        var filePath = path.join(currentDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile()) {
            callback(filePath, stat);
        } else if (stat.isDirectory()) {
            walkSync(filePath, callback);
        }
    });
}

const targetDir = path.join(__dirname, 'Src/modules');

walkSync(targetDir, (filePath) => {
    if (filePath.endsWith('Routes.js') || filePath.endsWith('Router.js')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let lines = content.split('\n');
        let modified = false;

        for (let i = 0; i < lines.length; i++) {
            // Find a line that contains `example: "..."`
            if (lines[i].includes('example: "')) {
                // Determine its current indentation (spaces before `*`)
                const match = lines[i].match(/^(\s*\*\s+)/);
                if (match) {
                    let exampleIndent = match[1];
                    
                    // Look back up to 3 lines to find the `type: string` line
                    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                        if (lines[j].includes('type: string')) {
                            const typeMatch = lines[j].match(/^(\s*\*\s+)/);
                            if (typeMatch) {
                                let typeIndent = typeMatch[1];
                                
                                // Fix the indentation of the example line to match the type line exactly
                                lines[i] = lines[i].replace(exampleIndent, typeIndent);
                                
                                // Remove any completely empty lines or lines with just an asterisk between them
                                for (let k = j + 1; k < i; k++) {
                                    if (lines[k].trim() === '' || lines[k].trim() === '*') {
                                        lines[k] = null; // Mark for deletion
                                    }
                                }
                                modified = true;
                            }
                            break;
                        }
                    }
                }
            }
        }

        if (modified) {
            // Filter out the null lines
            lines = lines.filter(line => line !== null);
            fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
            console.log(`Fully cleaned ${filePath}`);
        }
    }
});
console.log('Done!');

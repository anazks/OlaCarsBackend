const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('c:/Users/leno2/Desktop/OlaCarsBackend/Src/modules', (filePath) => {
    if (filePath.endsWith('.js')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        // Replace default imports: import name from "module"
        content = content.replace(/import\s+([a-zA-Z0-9_]+)\s+from\s+(['"][^'"]+['"]);?/g, 'const $1 = require($2);');

        // Replace named imports: import { name } from "module"
        content = content.replace(/import\s+\{\s*([a-zA-Z0-9_,\s]+)\s*\}\s+from\s+(['"][^'"]+['"]);?/g, 'const { $1 } = require($2);');

        // Replace named exports: export const name = ...
        content = content.replace(/export\s+const\s+([a-zA-Z0-9_]+)\s*=/g, 'exports.$1 =');

        // Replace default exports: export default ...
        content = content.replace(/export\s+default\s+(.*)/g, 'module.exports = $1');

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Updated: ' + filePath);
        }
    }
});

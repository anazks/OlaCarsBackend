const fs = require("fs");
const path = require("path");

const rootDir = "c:\\Users\\anton\\OneDrive\\Documents\\vs coding\\OlaCarsBackend\\Src";

function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, callback);
        } else if (file.toLowerCase().includes("invoice")) {
            callback(filePath);
        }
    });
}

walkDir(rootDir, (filePath) => {
    console.log(filePath);
});

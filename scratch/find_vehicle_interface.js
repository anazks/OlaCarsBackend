const fs = require("fs");
const path = require("path");

const dir = "c:\\Users\\anton\\OneDrive\\Documents\\vs coding\\olaCarsFrontEnd\\src\\services";
const files = fs.readdirSync(dir);

files.forEach(file => {
    if (file.endsWith(".ts")) {
        const content = fs.readFileSync(path.join(dir, file), "utf8");
        if (content.includes("interface Vehicle")) {
            console.log(`Found in: ${file}`);
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
                if (line.includes("interface Vehicle") || line.includes("currentDriver")) {
                    console.log(`  Line ${idx + 1}: ${line.trim()}`);
                }
            });
        }
    }
});

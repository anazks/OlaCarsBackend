const fs = require("fs");
const path = require("path");

const logPath = "C:\\Users\\Govind\\.gemini\\antigravity\\brain\\3ef98dfc-1f6c-4b4d-9e40-1de833ec8140\\.system_generated\\tasks\\task-230.log";

if (!fs.existsSync(logPath)) {
    console.error("Log file does not exist at:", logPath);
    process.exit(1);
}

const content = fs.readFileSync(logPath, "utf8");
const lines = content.split("\n");
const lastLines = lines.slice(-200);

console.log("=== LAST 200 LOG LINES ===");
console.log(lastLines.join("\n"));

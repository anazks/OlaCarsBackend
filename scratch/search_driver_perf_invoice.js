const fs = require("fs");
const path = require("path");

const filePath = "c:\\Users\\anton\\OneDrive\\Documents\\vs coding\\olaCarsFrontEnd\\src\\pages\\dashboards\\shared\\DriverPerformanceDashboard.tsx";
const content = fs.readFileSync(filePath, "utf8");
const lines = content.split("\n");

lines.forEach((line, idx) => {
    if (/invoice|overdue/i.test(line)) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});

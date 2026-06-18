const fs = require("fs");
const path = require("path");

const filePath = "c:\\Users\\anton\\OneDrive\\Documents\\vs coding\\olaCarsFrontEnd\\src\\pages\\dashboards\\shared\\VehicleDetail.tsx";
const content = fs.readFileSync(filePath, "utf8");
const lines = content.split("\n");

console.log("Matching lines:");
lines.forEach((line, idx) => {
    if (line.includes("personalInfo")) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});

const fs = require("fs");
const path = require("path");

const dir = "c:\\Users\\anton\\OneDrive\\Documents\\vs coding\\olaCarsFrontEnd\\src\\services";
const files = fs.readdirSync(dir);

files.forEach(file => {
    if (file.toLowerCase().includes("invoice")) {
        console.log(file);
    }
});

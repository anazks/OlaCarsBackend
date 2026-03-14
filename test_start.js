const fs = require("fs");
try {
    require("./app.js");
} catch (error) {
    fs.writeFileSync("startup_error.log", error.stack || error.toString());
}
setTimeout(() => {
    console.log("Exiting test.");
    process.exit(0);
}, 2000);

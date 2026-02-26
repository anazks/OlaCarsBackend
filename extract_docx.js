const mammoth = require("mammoth");
mammoth.extractRawText({ path: "C:\\Users\\leno2\\Downloads\\ola_cars_vehicle_onboarding.docx" })
    .then(function (result) {
        const text = result.value;
        const fs = require('fs');
        fs.writeFileSync('docx_extracted.txt', text);
        console.log("Extraction complete!");
    })
    .catch(console.error);

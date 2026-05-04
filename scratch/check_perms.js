const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const RoleTemplate = require("../Src/modules/AccessControl/Model/RoleTemplate");

async function checkPermissions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const roles = ["FINANCEADMIN", "FINANCESTAFF", "OPERATIONADMIN", "COUNTRYMANAGER", "BRANCHMANAGER", "OPERATIONSTAFF"];
        
        for (const roleName of roles) {
            const template = await RoleTemplate.findOne({ roleName });
            if (template) {
                console.log(`Role: ${roleName}`);
                console.log(`Permissions: ${template.permissions.join(", ")}`);
                console.log(`Has BRANCH_VIEW: ${template.permissions.includes("BRANCH_VIEW")}`);
                console.log("-------------------");
            } else {
                console.log(`Role: ${roleName} - NOT FOUND`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkPermissions();

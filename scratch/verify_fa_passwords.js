const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const FinanceAdmin = require("../Src/modules/FinanceAdmin/model/FinanceAdminModel.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const admins = await FinanceAdmin.find();
    console.log("=== FINANCE ADMINS PASSWORD CHECK ===");
    for (const admin of admins) {
        const isMatch = await bcrypt.compare("Test@1234", admin.passwordHash);
        if (isMatch) {
            console.log(`MATCH FOUND: ${admin.email} (${admin.fullName}), Status: ${admin.status}`);
        } else {
            console.log(`NO MATCH: ${admin.email} (${admin.fullName})`);
        }
    }
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

const mongoose = require("mongoose");
const FinanceAdmin = require("../Src/modules/FinanceAdmin/model/FinanceAdminModel.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const admins = await FinanceAdmin.find();
    console.log("=== FINANCE ADMINS ===");
    for (const admin of admins) {
        console.log({
            id: admin._id,
            fullName: admin.fullName,
            email: admin.email,
            role: admin.role,
            status: admin.status,
            permissions: admin.permissions,
        });
    }
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

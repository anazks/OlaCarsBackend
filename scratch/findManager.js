require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const WorkshopManager = require("../Src/modules/WorkshopManager/Model/WorkshopManagerModel");

(async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        const managers = await WorkshopManager.find({ isDeleted: false });
        console.log("Managers:", managers.map(m => ({ email: m.email, role: m.role, status: m.status })));
        
        if (managers.length > 0) {
            // Let's reset the first manager password to Test@1234
            const bcrypt = require("bcryptjs");
            const m = managers[0];
            m.passwordHash = await bcrypt.hash("Test@1234", 12);
            m.status = "ACTIVE";
            m.failedLoginAttempts = 0;
            m.lockUntil = undefined;
            await m.save();
            console.log(`Password reset for ${m.email} to 'Test@1234'`);
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err);
    }
})();

/**
 * seed_staff_performance_permission.js
 * Adds STAFF_PERFORMANCE_VIEW to roles that are missing it.
 * READ + targeted WRITE to permissions arrays only.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const ROLES_TO_UPDATE = [
    { collection: "countrymanagers",  roleName: "COUNTRYMANAGER" },
    { collection: "branchmanagers",   roleName: "BRANCHMANAGER" },
    { collection: "operationadmins",  roleName: "OPERATIONADMIN" },
    { collection: "operationstaffs",  roleName: "OPERATIONSTAFF" },
    { collection: "financeadmins",    roleName: "FINANCEADMIN" },
    { collection: "financestaffs",    roleName: "FINANCESTAFF" },
];

const PERMISSION = "STAFF_PERFORMANCE_VIEW";

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.\n");

        const db = mongoose.connection.db;

        // 1. Update RoleTemplate for each role
        console.log("── Updating RoleTemplates ──────────────────");
        for (const { roleName } of ROLES_TO_UPDATE) {
            const result = await db.collection("roletemplates").updateOne(
                { roleName },
                { $addToSet: { permissions: PERMISSION } }
            );
            console.log(`  ${roleName} template → matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
        }

        // 2. Update existing user documents for each role
        console.log("\n── Updating existing user documents ────────");
        for (const { collection, roleName } of ROLES_TO_UPDATE) {
            try {
                const result = await db.collection(collection).updateMany(
                    { isDeleted: { $ne: true } },
                    { $addToSet: { permissions: PERMISSION } }
                );
                console.log(`  ${collection} → matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
            } catch (e) {
                console.log(`  ${collection} → error: ${e.message}`);
            }
        }

        console.log("\n✅ Done. STAFF_PERFORMANCE_VIEW added to all required roles.\n");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
};

run();

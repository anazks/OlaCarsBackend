const AccountingCode = require("../modules/AccountingCode/Model/AccountingCodeModel");
const Admin = require("../modules/Admin/model/adminModel");
const { mapAccountTypeToCategory } = require("../modules/AccountingCode/Service/AccountingCodeService");

/**
 * Automatically seeds the critical accounting codes (like 4100 for Sales)
 * required for ledger and payment records generation.
 * Also runs an automatic healing migration to correct legacy category data.
 */
const seedAccountingCodes = async () => {
    try {
        console.log("[SEEDER] Checking essential Accounting Codes...");

        // Migration: Healing existing records that have detailed categories saved in the category field
        console.log("[MIGRATION] Checking for any legacy detailed categories in database...");
        const allCodesInDb = await AccountingCode.find({});
        for (const codeDoc of allCodesInDb) {
            let needsUpdate = false;
            // Check if category is not one of core uppercase values
            if (codeDoc.category && !["INCOME", "EXPENSE", "LIABILITY", "ASSET", "EQUITY"].includes(codeDoc.category)) {
                const legacyVal = codeDoc.category;
                const resolvedCategory = mapAccountTypeToCategory(legacyVal);
                
                codeDoc.category = resolvedCategory;
                // If accountType is not defined, set it to the legacy detailed category value
                if (!codeDoc.accountType) {
                    codeDoc.accountType = legacyVal;
                }
                needsUpdate = true;
            }
            if (needsUpdate) {
                await codeDoc.save();
                console.log(`[MIGRATION] Healed legacy account code ${codeDoc.code}: mapped category to "${codeDoc.category}" and set accountType to "${codeDoc.accountType}"`);
            }
        }

        // Find default admin to assign as creator (kept for consistency or future use if needed, but not seeding anymore)
        const systemAdmin = await Admin.findOne({ role: "ADMIN" });
        if (!systemAdmin) {
            console.log("[SEEDER] No System Admin found. Skipping seeder operations.");
            return;
        }
    } catch (error) {
        console.error("[SEEDER] Accounting Code seeding failed:", error.message);
    }
};

module.exports = { seedAccountingCodes };

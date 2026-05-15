const AccountingCode = require("../modules/AccountingCode/Model/AccountingCodeModel");
const Admin = require("../modules/Admin/model/adminModel");

/**
 * Automatically seeds the critical accounting codes (like 4100 for Sales)
 * required for ledger and payment records generation.
 */
const seedAccountingCodes = async () => {
    try {
        console.log("[SEEDER] Checking essential Accounting Codes...");

        // Find default admin to assign as creator
        const systemAdmin = await Admin.findOne({ role: "ADMIN" });
        if (!systemAdmin) {
            console.error("[SEEDER] Cannot seed accounting codes: No System Admin found.");
            return;
        }

        const codesToSeed = [
            {
                code: "4100",
                name: "Rental Income (Sales)",
                description: "Revenue earned from driver rentals and vehicle hire.",
                category: "INCOME",
            },
            {
                code: "1200",
                name: "Accounts Receivable",
                description: "Outstanding payments due from drivers/customers.",
                category: "ASSET",
            },
            {
                code: "4200",
                name: "Sales Allowances & Discounts (Credit Notes)",
                description: "Adjustments, credits and refunds issued against customer bills.",
                category: "INCOME",
            }
        ];

        for (const rawCode of codesToSeed) {
            const existing = await AccountingCode.findOne({ code: rawCode.code });
            if (!existing) {
                await AccountingCode.create({
                    ...rawCode,
                    createdBy: systemAdmin._id,
                    creatorRole: "ADMIN",
                    isActive: true,
                    isDeleted: false
                });
                console.log(`[SEEDER] Created essential Accounting Code: ${rawCode.code} - ${rawCode.name}`);
            } else {
                // Ensure it is active and not soft-deleted
                if (!existing.isActive || existing.isDeleted) {
                    existing.isActive = true;
                    existing.isDeleted = false;
                    await existing.save();
                    console.log(`[SEEDER] Activated/Healed existing Accounting Code: ${rawCode.code}`);
                }
            }
        }
    } catch (error) {
        console.error("[SEEDER] Accounting Code seeding failed:", error.message);
    }
};

module.exports = { seedAccountingCodes };

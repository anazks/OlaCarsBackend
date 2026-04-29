const FinanceStaff = require("../modules/FinanceStaff/Model/FinanceStaffModel");
const FinanceAdmin = require("../modules/FinanceAdmin/Model/FinanceAdminModel");
const RoleTemplate = require("../modules/AccessControl/Model/RoleTemplate");

/**
 * Automatically seeds the new financial permissions to ensure staff can use the new system.
 */
const seedFinancePermissions = async () => {
    try {
        const requiredPermissions = [
            "JOURNAL_CREATE",
            "JOURNAL_VIEW",
            "FINANCIAL_REPORT_VIEW",
            "LEDGER_VIEW",
            "ACCOUNTING_CODE_VIEW"
        ];

        console.log("[SEEDER] Updating Finance Role Templates...");
        
        // 1. Update Role Templates for persistence on new users
        const financeRoles = ["FINANCESTAFF", "FINANCEADMIN"];
        for (const role of financeRoles) {
            let template = await RoleTemplate.findOne({ roleName: role });
            if (template) {
                const newPerms = [...new Set([...template.permissions, ...requiredPermissions])];
                template.permissions = newPerms;
                await template.save();
                console.log(`[SEEDER] Updated RoleTemplate: ${role}`);
            } else {
                // Create template if missing
                await RoleTemplate.create({
                    roleName: role,
                    permissions: requiredPermissions,
                    description: `Standard ${role} permissions including Journal Entry access.`
                });
                console.log(`[SEEDER] Created missing RoleTemplate: ${role}`);
            }
        }

        // 2. Update existing users so they don't get 403 right now
        console.log("[SEEDER] Syncing permissions to existing staff users...");
        
        const staffUpdate = await FinanceStaff.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: requiredPermissions } } }
        );
        console.log(`[SEEDER] Updated ${staffUpdate.modifiedCount} Finance Staff users.`);

        const adminUpdate = await FinanceAdmin.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: requiredPermissions } } }
        );
        console.log(`[SEEDER] Updated ${adminUpdate.modifiedCount} Finance Admin users.`);

    } catch (error) {
        console.error("[SEEDER] Finance Permission seeding failed:", error.message);
    }
};

module.exports = { seedFinancePermissions };

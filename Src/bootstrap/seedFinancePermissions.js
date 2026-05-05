const FinanceStaff = require("../modules/FinanceStaff/Model/FinanceStaffModel");
const FinanceAdmin = require("../modules/FinanceAdmin/model/FinanceAdminModel");
const RoleTemplate = require("../modules/AccessControl/Model/RoleTemplate");

/**
 * Automatically seeds the new financial permissions to ensure staff can use the new system.
 */
const seedFinancePermissions = async () => {
    try {
        const staffPermissions = [
            "JOURNAL_CREATE",
            "JOURNAL_VIEW",
            "FINANCIAL_REPORT_VIEW",
            "LEDGER_VIEW",
            "LEDGER_CREATE",
            "ACCOUNTING_CODE_VIEW",
            "BRANCH_VIEW",
            "TAX_VIEW",
            "PAYMENT_VIEW",
            "PAYMENT_CREATE",
            "REPORTS_VIEW",
            "DASHBOARD_VIEW",
            "DRIVER_VIEW",
            "STAFF_PERFORMANCE_VIEW"
        ];

        const adminPermissions = [
            ...staffPermissions,
            "LEDGER_EDIT",
            "LEDGER_DELETE",
            "ACCOUNTING_CODE_CREATE",
            "ACCOUNTING_CODE_EDIT",
            "ACCOUNTING_CODE_DELETE",
            "TAX_CREATE",
            "TAX_EDIT",
            "TAX_DELETE",
            "PAYMENT_EDIT",
            "PAYMENT_DELETE",
            "PAYMENT_APPROVE",
            "SUPPLIER_VIEW",
            "PURCHASE_ORDER_VIEW",
            "INVENTORY_VIEW",
            "SERVICE_BILL_VIEW",
            "STAFF_VIEW",
            "STAFF_CREATE",
            "STAFF_EDIT",
            "STAFF_DELETE"
        ];

        console.log("[SEEDER] Updating Finance Role Templates...");
        
        // 1. Update Role Templates for persistence on new users
        const financeRoles = ["FINANCESTAFF", "FINANCEADMIN"];
        for (const role of financeRoles) {
            const permsToUse = role === "FINANCEADMIN" ? adminPermissions : staffPermissions;
            let template = await RoleTemplate.findOne({ roleName: role });
            if (template) {
                const newPerms = [...new Set([...template.permissions, ...permsToUse])];
                template.permissions = newPerms;
                await template.save();
                console.log(`[SEEDER] Updated RoleTemplate: ${role}`);
            } else {
                // Create template if missing
                await RoleTemplate.create({
                    roleName: role,
                    permissions: permsToUse,
                    description: `Standard ${role} permissions including Journal Entry access.`
                });
                console.log(`[SEEDER] Created missing RoleTemplate: ${role}`);
            }
        }

        // 2. Update existing users so they don't get 403 right now
        console.log("[SEEDER] Syncing permissions to existing staff users...");
        
        const staffUpdate = await FinanceStaff.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: staffPermissions } } }
        );
        console.log(`[SEEDER] Updated ${staffUpdate.modifiedCount} Finance Staff users.`);

        const adminUpdate = await FinanceAdmin.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: adminPermissions } } }
        );
        console.log(`[SEEDER] Updated ${adminUpdate.modifiedCount} Finance Admin users.`);

    } catch (error) {
        console.error("[SEEDER] Finance Permission seeding failed:", error.message);
    }
};

module.exports = { seedFinancePermissions };

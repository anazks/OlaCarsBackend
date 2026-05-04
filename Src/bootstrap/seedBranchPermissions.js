const RoleTemplate = require("../modules/AccessControl/Model/RoleTemplate");
const OperationAdmin = require("../modules/OperationAdmin/model/OperationAdminModel");
const CountryManager = require("../modules/CountryManager/Model/CountryManagerModel");
const BranchManager = require("../modules/BranchManager/Model/BranchManagerModel");
const OperationStaff = require("../modules/OperationStaff/Model/OperationStaffModel");

/**
 * Seeds Branch-related permissions to various administrative roles.
 */
const seedBranchPermissions = async () => {
    try {
        const branchPermissions = ["BRANCH_VIEW"];
        const targetRoles = [
            "OPERATIONADMIN",
            "COUNTRYMANAGER",
            "BRANCHMANAGER",
            "OPERATIONSTAFF"
        ];

        console.log("[SEEDER] Updating Branch permissions for Role Templates...");
        
        for (const role of targetRoles) {
            let template = await RoleTemplate.findOne({ roleName: role });
            if (template) {
                const newPerms = [...new Set([...template.permissions, ...branchPermissions])];
                template.permissions = newPerms;
                await template.save();
                console.log(`[SEEDER] Updated RoleTemplate: ${role}`);
            } else {
                await RoleTemplate.create({
                    roleName: role,
                    permissions: branchPermissions,
                    description: `Standard ${role} permissions including Branch view access.`
                });
                console.log(`[SEEDER] Created missing RoleTemplate: ${role}`);
            }
        }

        console.log("[SEEDER] Syncing Branch permissions to existing users...");
        
        // Update Operation Admins
        await OperationAdmin.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: branchPermissions } } }
        );

        // Update Country Managers
        await CountryManager.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: branchPermissions } } }
        );

        // Update Branch Managers
        await BranchManager.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: branchPermissions } } }
        );

        // Update Operation Staff
        await OperationStaff.updateMany(
            { isDeleted: false },
            { $addToSet: { permissions: { $each: branchPermissions } } }
        );

        console.log("[SEEDER] Branch permissions synced successfully.");

    } catch (error) {
        console.error("[SEEDER] Branch Permission seeding failed:", error.message);
    }
};

module.exports = { seedBranchPermissions };

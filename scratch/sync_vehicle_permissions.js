require("dotenv").config();
const mongoose = require("mongoose");
const RoleTemplate = require("../Src/modules/AccessControl/Model/RoleTemplate");
const OperationStaff = require("../Src/modules/OperationStaff/Model/OperationStaffModel");
const FinanceStaff = require("../Src/modules/FinanceStaff/Model/FinanceStaffModel");
const connectDB = require("../Src/config/dbConfig");

const syncVehiclePermissions = async () => {
    try {
        await connectDB();
        console.log("Database connected.");

        const rolesToUpdate = ["OPERATIONSTAFF", "FINANCESTAFF"];
        const permissionsToAdd = ["VEHICLE_VIEW"];

        for (const roleName of rolesToUpdate) {
            console.log(`Updating ${roleName}...`);
            
            // 1. Update Role Template
            let template = await RoleTemplate.findOne({ roleName });
            if (template) {
                template.permissions = [...new Set([...template.permissions, ...permissionsToAdd])];
                await template.save();
                console.log(`- Updated RoleTemplate: ${roleName}`);
            } else {
                await RoleTemplate.create({
                    roleName,
                    permissions: permissionsToAdd,
                    description: `Standard ${roleName} permissions.`
                });
                console.log(`- Created RoleTemplate: ${roleName}`);
            }

            // 2. Update existing users
            let Model;
            if (roleName === "OPERATIONSTAFF") Model = OperationStaff;
            if (roleName === "FINANCESTAFF") Model = FinanceStaff;

            if (Model) {
                const result = await Model.updateMany(
                    { isDeleted: false },
                    { $addToSet: { permissions: { $each: permissionsToAdd } } }
                );
                console.log(`- Updated ${result.modifiedCount} users in ${roleName}`);
            }
        }

        console.log("Permission sync complete.");
        process.exit(0);
    } catch (error) {
        console.error("Sync failed:", error.message);
        process.exit(1);
    }
};

syncVehiclePermissions();

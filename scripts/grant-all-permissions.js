const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig"); // Adjust path if needed
const { ALL_PERMISSIONS } = require("../Src/modules/AccessControl/Constants/permissions");

// Import all models
const Admin = require("../Src/modules/Admin/Model/adminModel");
const BranchManager = require("../Src/modules/BranchManager/Model/BranchManagerModel");
const CountryManager = require("../Src/modules/CountryManager/Model/CountryManagerModel");
const FinanceAdmin = require("../Src/modules/FinanceAdmin/Model/FinanceAdminModel");
const FinanceStaff = require("../Src/modules/FinanceStaff/Model/FinanceStaffModel");
const OperationAdmin = require("../Src/modules/OperationAdmin/Model/OperationAdminModel");
const OperationStaff = require("../Src/modules/OperationStaff/Model/OperationStaffModel");
const WorkshopManager = require("../Src/modules/WorkshopManager/Model/WorkshopManagerModel");
const WorkshopStaff = require("../Src/modules/WorkshopStaff/Model/WorkshopStaffModel");

require("dotenv").config();

async function grantAllPermissions() {
  try {
    await connectDB();
    console.log("Connected to DB...");

    const models = [
      Admin,
      BranchManager,
      CountryManager,
      FinanceAdmin,
      FinanceStaff,
      OperationAdmin,
      OperationStaff,
      WorkshopManager,
      WorkshopStaff,
    ];

    console.log(`Granting ${ALL_PERMISSIONS.length} permissions to all existing staff...`);

    let totalUpdated = 0;

    for (const Model of models) {
      if (!Model) continue;

      const result = await Model.updateMany(
        {}, 
        { $set: { permissions: ALL_PERMISSIONS } }
      );
      
      console.log(`Updated ${result.modifiedCount} accounts in ${Model.modelName}`);
      totalUpdated += result.modifiedCount;
    }

    console.log(`\nMigration complete. Total accounts updated: ${totalUpdated}`);
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

grantAllPermissions();

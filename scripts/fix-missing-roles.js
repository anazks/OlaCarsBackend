const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
require("dotenv").config();

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
const User = require("../Src/modules/User/Model/UserModel");

async function fixMissingRoles() {
  try {
    await connectDB();
    console.log("Connected to DB...");

    const migrationTasks = [
      { model: Admin, role: "ADMIN" },
      { model: BranchManager, role: "BRANCHMANAGER" },
      { model: CountryManager, role: "COUNTRYMANAGER" },
      { model: FinanceAdmin, role: "FINANCEADMIN" },
      { model: FinanceStaff, role: "FINANCESTAFF" },
      { model: OperationAdmin, role: "OPERATIONADMIN" },
      { model: OperationStaff, role: "OPERATIONSTAFF" },
      { model: WorkshopManager, role: "WORKSHOPMANAGER" },
      { model: WorkshopStaff, role: "WORKSHOPSTAFF" },
      { model: User, role: "USER" },
    ];

    console.log("Restoring missing 'role' field across all collections...");

    let totalUpdated = 0;

    for (const task of migrationTasks) {
      if (!task.model) continue;

      const result = await task.model.updateMany(
        { $or: [{ role: { $exists: false } }, { role: "" }, { role: null }] },
        { $set: { role: task.role } }
      );
      
      console.log(`Updated ${result.modifiedCount} accounts in ${task.model.modelName} to role: ${task.role}`);
      totalUpdated += result.modifiedCount;
    }

    console.log(`\nMigration complete. Total roles restored: ${totalUpdated}`);
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

fixMissingRoles();

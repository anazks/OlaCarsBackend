const mongoose = require('mongoose');
require('dotenv').config();

const Fleet = require('../Src/modules/Fleet/Model/FleetModel');
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const OperationStaff = require('../Src/modules/OperationStaff/Model/OperationStaffModel');
const FinanceStaff = require('../Src/modules/FinanceStaff/Model/FinanceStaffModel');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
      console.log('Connected to Database successfully.');

      // 1. Fetch all active/non-deleted branches
      const branches = await Branch.find({ isDeleted: false });
      if (branches.length === 0) {
          console.error('Error: No active branches found in the database. Cannot migrate.');
          process.exit(1);
      }
      const defaultBranchId = branches[0]._id;
      console.log(`Found ${branches.length} active branches. Default fallback Branch: ${branches[0].name} (${defaultBranchId})`);

      // 2. Fetch all fleets
      const fleets = await Fleet.find({ isDeleted: false });
      console.log(`Found ${fleets.length} active fleets to migrate.`);

      let migratedCount = 0;
      let skippedCount = 0;

      for (const fleet of fleets) {
          if (fleet.branchId) {
              console.log(`Fleet #${fleet.fleetNumber} already has branchId: ${fleet.branchId}. Skipping.`);
              skippedCount++;
              continue;
          }

          let branchIdToAssign = defaultBranchId;

          if (fleet.assignedStaff) {
              const StaffModel = fleet.assignedStaffModel === 'OperationStaff' ? OperationStaff : FinanceStaff;
              const staff = await StaffModel.findById(fleet.assignedStaff);
              if (staff && staff.branchId) {
                  branchIdToAssign = staff.branchId;
                  console.log(`Fleet #${fleet.fleetNumber} staff "${staff.fullName}" has branchId: ${staff.branchId}. Matching.`);
              } else {
                  console.log(`Fleet #${fleet.fleetNumber} staff not found or has no branchId. Using default branch.`);
              }
          } else {
              console.log(`Fleet #${fleet.fleetNumber} has no assigned staff. Using default branch.`);
          }

          fleet.branchId = branchIdToAssign;
          await fleet.save();
          console.log(`Migrated Fleet #${fleet.fleetNumber} with branchId: ${branchIdToAssign}`);
          migratedCount++;
      }

      console.log(`Migration completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}, Total: ${fleets.length}`);
      process.exit(0);
  })
  .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
  });

const mongoose = require('mongoose');
require('dotenv').config();

const Fleet = require('../Src/modules/Fleet/Model/FleetModel');
const Branch = require('../Src/modules/Branch/Model/BranchModel');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
      console.log('Connected to Database successfully.');

      const fleets = await Fleet.find({}).populate('branchId');
      console.log('ALL FLEETS IN DB:');
      fleets.forEach(f => {
          console.log(`- ID: ${f._id}, FleetNumber: ${f.fleetNumber}, branchId (Raw): ${f._doc.branchId}, branchId (Populated):`, f.branchId);
      });

      process.exit(0);
  })
  .catch(err => {
      console.error(err);
      process.exit(1);
  });

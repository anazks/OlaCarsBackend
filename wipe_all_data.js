const mongoose = require('mongoose');
require('dotenv').config();

const { Driver } = require('./Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('./Src/modules/Vehicle/Model/VehicleModel');
const { Invoice } = require('./Src/modules/Invoice/Model/InvoiceModel');
const Bill = require('./Src/modules/Bill/Model/BillModel');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
      console.log('Connected to DB');
      await Driver.deleteMany({});
      await Vehicle.deleteMany({});
      await Invoice.deleteMany({});
      await Bill.deleteMany({});
      console.log('Wiped all Drivers, Vehicles, Invoices, and Bills from DB.');
      process.exit(0);
  })
  .catch(err => {
      console.error(err);
      process.exit(1);
  });

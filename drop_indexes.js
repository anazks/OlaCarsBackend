const mongoose = require('mongoose');
require('dotenv').config();
const { Driver } = require('./Src/modules/Driver/Model/DriverModel');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
      console.log('Connected to DB');
      try {
          await Driver.collection.dropIndex('personalInfo.email_1');
          console.log('Successfully dropped the unique index on personalInfo.email');
      } catch (err) {
          console.log('Index might not exist or another error occurred:', err.message);
      }
      try {
          await Driver.collection.dropIndex('personalInfo.phone_1');
          console.log('Successfully dropped the unique index on personalInfo.phone');
      } catch (err) {
          console.log('Index might not exist or another error occurred:', err.message);
      }
      process.exit(0);
  })
  .catch(err => {
      console.error(err);
      process.exit(1);
  });

const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
      console.log('Connected to DB');
      const db = mongoose.connection.db;
      const collection = db.collection('drivers');
      
      console.log('Listing current indexes for drivers:');
      const indexesBefore = await collection.indexes();
      console.log(JSON.stringify(indexesBefore, null, 2));
      
      const hasEmailIndex = indexesBefore.some(idx => idx.name === 'personalInfo.email_1');
      if (hasEmailIndex) {
          console.log('Dropping unique personalInfo.email_1 index...');
          await collection.dropIndex('personalInfo.email_1');
          console.log('Successfully dropped unique personalInfo.email_1 index.');
      } else {
          console.log('No personalInfo.email_1 index found.');
      }

      console.log('Creating non-unique sparse personalInfo.email_1 index...');
      await collection.createIndex({ "personalInfo.email": 1 }, { sparse: true });
      console.log('Successfully created non-unique sparse personalInfo.email_1 index.');
      
      const indexesAfter = await collection.indexes();
      console.log('Indexes after modification:');
      console.log(JSON.stringify(indexesAfter, null, 2));
      
      process.exit(0);
  })
  .catch(err => {
      console.error(err);
      process.exit(1);
  });

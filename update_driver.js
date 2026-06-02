const mongoose = require('mongoose');
require('dotenv').config();

async function updateActiveDriver() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');
  
  const db = mongoose.connection.db;
  const collection = db.collection('drivers');
  
  const activeDrivers = await collection.find({ status: 'ACTIVE' }).toArray();
  console.log('Active Drivers count:', activeDrivers.length);
  
  if (activeDrivers.length > 0) {
    const driver = activeDrivers[0];
    console.log('Found active driver:', driver.personalInfo?.fullName || driver._id);
    console.log('Driver email:', driver.personalInfo?.email);
    console.log('Driver phone:', driver.personalInfo?.phone);
    
    // Add the license number
    await collection.updateOne(
      { _id: driver._id },
      { 
        $set: { 'drivingLicense.licenseNumber': 'DL-12355' },
        $unset: { 'licenseDetails': "" } 
      }
    );
    console.log('Successfully updated the driver with a license number.');
  } else {
    console.log('No active drivers found.');
  }
  
  process.exit(0);
}

updateActiveDriver().catch(console.error);

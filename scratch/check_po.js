const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');
    
    // Define a simple schema for purchaseorders
    const POSchema = new mongoose.Schema({}, { strict: false });
    const PO = mongoose.model('purchaseorders', POSchema);
    
    const latestPO = await PO.findOne().sort({ createdAt: -1 });
    if (!latestPO) {
      console.log('No purchase orders found');
      return;
    }
    
    console.log('LATEST PO DETAILS:');
    console.log('ID:', latestPO._id);
    console.log('PO Number:', latestPO.purchaseOrderNumber);
    console.log('Created At:', latestPO.createdAt);
    console.log('Items:', JSON.stringify(latestPO.items, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const Supplier = require('../Src/modules/Supplier/Model/SupplierModel.js');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await Supplier.deleteMany({ name: /Test Supplier API/ });
    console.log('Cleanup results:', result);
    await mongoose.disconnect();
}
main();

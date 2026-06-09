const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const SupplierService = require('../Src/modules/Supplier/Service/SupplierService.js');
const Supplier = require('../Src/modules/Supplier/Model/SupplierModel.js');

async function main() {
    try {
        console.log('Connecting to', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Let's find an active admin user
        const dbColl = mongoose.connection.collection('admins');
        const admin = await dbColl.findOne({ isDeleted: false, status: 'ACTIVE' });
        if (!admin) {
            console.error('No active admin found!');
            await mongoose.disconnect();
            return;
        }
        console.log(`Using admin: ${admin.email} (ID: ${admin._id})`);

        // Check current suppliers count
        const suppliersCount = await Supplier.countDocuments({ isDeleted: false });
        console.log(`Current active suppliers count: ${suppliersCount}`);

        // Try to simulate a bulk create with a dummy supplier
        const dummyData = [
            {
                contactName: "Test Supplier Bulk 1",
                displayName: "Test Supplier Bulk 1",
                email: "test_bulk_1@example.com",
                accountsPayable: "Accounts Payable", // or code e.g. "2100"
                cfActiveDate: "2026-06-09"
            }
        ];

        console.log('Running bulkCreate...');
        const results = await SupplierService.bulkCreate(dummyData, admin._id, 'ADMIN');
        console.log('Results:', JSON.stringify(results, null, 2));

        // Clean up test supplier if created
        if (results.created.length > 0) {
            console.log('Cleaning up test supplier...');
            await Supplier.deleteOne({ _id: results.created[0].id });
            console.log('Cleanup done');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error during test execution:', err);
    }
}
main();

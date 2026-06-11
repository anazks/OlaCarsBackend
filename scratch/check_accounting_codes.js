const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const db = mongoose.connection.client.db('olaCarsFresh');
        
        const totalAccounts = await db.collection('accountingcodes').countDocuments({});
        const activeAccounts = await db.collection('accountingcodes').countDocuments({ isDeleted: false, isActive: true });
        
        console.log(`Total accounting codes in DB: ${totalAccounts}`);
        console.log(`Active (non-deleted) accounting codes in DB: ${activeAccounts}`);

        const sample = await db.collection('accountingcodes').find({}).limit(50).toArray();
        console.log('\nSample Accounting Codes (up to 50):');
        sample.forEach(acc => {
            console.log(`- Code: "${acc.code}", Name: "${acc.name}", Category: "${acc.category}", Active: ${acc.isActive}, Deleted: ${acc.isDeleted}`);
        });

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();

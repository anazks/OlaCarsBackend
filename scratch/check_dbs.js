const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const adminDb = mongoose.connection.client.db().admin();
        const dbs = await adminDb.listDatabases();
        console.log('Databases on Cluster:');
        console.log(JSON.stringify(dbs, null, 2));

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();

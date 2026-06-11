const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const targetDbs = ['olaCars', 'olaCarsBackup', 'olaCarsFresh', 'olaCarsMigration'];
const collections = ['vehicles', 'inventoryparts', 'drivers', 'customers', 'suppliers'];

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        for (const dbName of targetDbs) {
            const db = mongoose.connection.client.db(dbName);
            console.log(`\nDatabase: "${dbName}"`);
            
            for (const colName of collections) {
                // Check if collection exists
                const list = await db.listCollections({ name: colName }).toArray();
                if (list.length === 0) {
                    console.log(`  - Collection "${colName}" does not exist.`);
                    continue;
                }

                const total = await db.collection(colName).countDocuments({});
                const recent = await db.collection(colName).countDocuments({
                    createdAt: { $gte: oneWeekAgo }
                });
                
                console.log(`  - ${colName}: total=${total}, created in last 7 days=${recent}`);

                if (recent > 0) {
                    const sample = await db.collection(colName).find({
                        createdAt: { $gte: oneWeekAgo }
                    }).limit(3).toArray();
                    console.log(`    Sample recent:`);
                    sample.forEach(doc => {
                        console.log(`      ID: ${doc._id}, createdAt: ${doc.createdAt}`);
                        if (colName === 'vehicles') {
                            console.log(`        Make/Model: ${doc.basicDetails?.make} ${doc.basicDetails?.model}, Reg: ${doc.legalDocs?.registrationNumber}`);
                        } else if (colName === 'inventoryparts') {
                            console.log(`        PartName: ${doc.partName}, SKU: ${doc.partNumber}`);
                        } else if (colName === 'customers') {
                            console.log(`        Name: ${doc.personalInfo?.fullName || doc.name}`);
                        } else if (colName === 'suppliers') {
                            console.log(`        Name: ${doc.name || doc.displayName}`);
                        }
                    });
                }
            }
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function checkCustomers() {
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;
        const customersCol = db.collection('customers');
        const driversCol = db.collection('drivers');

        const testCustomers = [
            { name: "HEBER BERNAL EW1788", id: "6671277000015954071" },
            { name: "ANDRES RIVERA EP5883", id: "6671277000013430039" },
            { name: "ERVIN BRONDRAVO EU8521", id: "6671277000011553286" }
        ];

        for (const item of testCustomers) {
            console.log(`\n----------------------------------------`);
            console.log(`Checking Customer: ${item.name} (${item.id})`);

            const custs = await customersCol.find({
                $or: [
                    { customerId: item.id },
                    { customerNumber: item.id },
                    { name: new RegExp(item.name.split(' ')[0], 'i') }
                ]
            }).toArray();

            console.log(`Found ${custs.length} matching customer(s):`);
            custs.forEach(c => {
                console.log(`  Customer _id: ${c._id}, name: "${c.name}", customerId: "${c.customerId}", driver: ${c.driver}`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkCustomers();

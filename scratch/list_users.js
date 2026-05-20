const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const collections = [
    { name: 'admins', role: 'admin' },
    { name: 'workshopstaffs', role: 'workshop-staff' },
    { name: 'workshopmanagers', role: 'workshop-manager' },
    { name: 'operationstaffs', role: 'branch-op-staff' },
    { name: 'operationaladmins', role: 'operational-admin' },
    { name: 'financestaffs', role: 'branch-fin-staff' },
    { name: 'financeadmins', role: 'financial-admin' },
    { name: 'branchmanagers', role: 'branch-manager' },
    { name: 'countrymanagers', role: 'country-manager' }
];

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        for (const coll of collections) {
            const dbColl = mongoose.connection.collection(coll.name);
            const users = await dbColl.find({ isDeleted: false, status: 'ACTIVE' }).toArray();
            if (users.length > 0) {
                console.log(`=== ${coll.role} ===`);
                users.forEach(u => console.log(`Email: ${u.email}, Name: ${u.fullName}`));
            }
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
main();

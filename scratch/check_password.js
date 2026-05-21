const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const passwords = ['Test@1234', 'StrongPassword@123', 'Password123!', 'Admin@123', 'admin123', 'password'];

const collections = [
    { name: 'admins', label: 'Admin' },
    { name: 'financeadmins', label: 'FinanceAdmin' }
];

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    for (const coll of collections) {
        const dbColl = mongoose.connection.collection(coll.name);
        const users = await dbColl.find({ isDeleted: false }).toArray();
        for (const user of users) {
            for (const pwd of passwords) {
                if (user.passwordHash && await bcrypt.compare(pwd, user.passwordHash)) {
                    console.log(`FOUND MATCH: ${coll.label} - ${user.email} -> ${pwd}`);
                }
            }
        }
    }
    await mongoose.disconnect();
}
main();

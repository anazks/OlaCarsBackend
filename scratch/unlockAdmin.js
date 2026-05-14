const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('MONGO_URI not found in .env');
    process.exit(1);
}

const collections = [
    { name: 'admins', modelName: 'Admin' },
    { name: 'workshopstaffs', modelName: 'WorkshopStaff' },
    { name: 'workshopmanagers', modelName: 'WorkshopManager' },
    { name: 'operationstaffs', modelName: 'OperationStaff' },
    { name: 'operationaladmins', modelName: 'OperationalAdmin' },
    { name: 'financestaffs', modelName: 'FinanceStaff' },
    { name: 'financeadmins', modelName: 'FinanceAdmin' },
    { name: 'branchmanagers', modelName: 'BranchManager' },
    { name: 'countrymanagers', modelName: 'CountryManager' }
];

async function unlockAll() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        for (const coll of collections) {
            console.log(`Checking collection: ${coll.name}...`);
            const dbColl = mongoose.connection.collection(coll.name);
            
            const lockedUsers = await dbColl.find({
                $or: [
                    { status: 'LOCKED' },
                    { lockUntil: { $gt: new Date() } }
                ]
            }).toArray();

            if (lockedUsers.length > 0) {
                console.log(`Found ${lockedUsers.length} locked account(s) in ${coll.name}.`);
                for (const user of lockedUsers) {
                    console.log(`Unlocking: ${user.email}`);
                    await dbColl.updateOne(
                        { _id: user._id },
                        {
                            $set: {
                                status: 'ACTIVE',
                                failedLoginAttempts: 0
                            },
                            $unset: {
                                lockUntil: ""
                            }
                        }
                    );
                    console.log(`Successfully unlocked ${user.email}`);
                }
            } else {
                // console.log(`No locked accounts in ${coll.name}.`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

unlockAll();

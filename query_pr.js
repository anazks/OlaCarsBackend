const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://admin:123@cluster0.h9lmv8j.mongodb.net/olaCarsMigration?appName=Cluster0';

async function run() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;
        const prs = await db.collection('workshopprocurements').find({}).toArray();
        console.log(`Found ${prs.length} procurement requests:`);
        prs.forEach(pr => {
            console.log({
                _id: pr._id,
                requestNumber: pr.requestNumber,
                status: pr.status,
                branch: pr.branch,
                requestedBy: pr.requestedBy,
                requestedByRole: pr.requestedByRole,
                part: pr.part,
                createdAt: pr.createdAt
            });
        });

        // Let's also check the branch and users
        const branches = await db.collection('branches').find({}).toArray();
        console.log(`\nFound ${branches.length} branches:`);
        branches.forEach(b => {
            console.log({ _id: b._id, name: b.name, type: b.type, parentBranch: b.parentBranch });
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

run();

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/olacars';

// Define Minimal Models
const CountryManagerSchema = new mongoose.Schema({
    fullName: String,
    country: String
});
const CountryManager = mongoose.model('CountryManager', CountryManagerSchema, 'countrymanagers');

const BranchSchema = new mongoose.Schema({
    name: String,
    country: String,
    countryManager: { type: mongoose.Schema.Types.ObjectId, ref: 'CountryManager' }
});
const Branch = mongoose.model('Branch', BranchSchema, 'branches');

async function migrate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const managers = await CountryManager.find({});
        console.log(`Found ${managers.length} country managers`);

        const branches = await Branch.find({ countryManager: { $exists: false } });
        console.log(`Found ${branches.length} unmapped branches`);

        for (const branch of branches) {
            const manager = managers.find(m => m.country === branch.country);
            if (manager) {
                branch.countryManager = manager._id;
                await branch.save();
                console.log(`Mapped branch ${branch.name} to manager ${manager.fullName} (${branch.country})`);
            } else {
                console.log(`No manager found for branch ${branch.name} in country ${branch.country}`);
            }
        }

        console.log('Migration complete');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

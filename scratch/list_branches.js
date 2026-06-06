const mongoose = require('mongoose');
require('dotenv').config();
const Branch = require('../Src/modules/Branch/Model/BranchModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const branches = await Branch.find({});
    console.log(JSON.stringify(branches.map(b => ({
        id: b._id,
        name: b.name,
        country: b.country,
        city: b.city
    })), null, 2));
    process.exit(0);
}
run();

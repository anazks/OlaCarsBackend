const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const CountryManager = require('../Src/modules/CountryManager/Model/CountryManagerModel');
        
        const result = await CountryManager.updateMany(
            { role: 'COUNTRYMANAGER' },
            { $addToSet: { permissions: 'LEDGER_VIEW' } }
        );

        console.log(`Updated ${result.modifiedCount} Country Managers with LEDGER_VIEW permission.`);

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

run();

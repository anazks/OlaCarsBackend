const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const CountryManager = require('../Src/modules/CountryManager/Model/CountryManagerModel');
        
        const managers = await CountryManager.find();
        console.log("Country Managers:", JSON.stringify(managers, null, 2));

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

run();

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const RoleTemplate = require('../Src/modules/AccessControl/Model/RoleTemplate');
        
        const templates = await RoleTemplate.find();
        console.log("Role Templates:", JSON.stringify(templates, null, 2));

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

run();

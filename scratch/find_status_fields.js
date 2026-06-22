const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const allVehicles = await Vehicle.find({}).lean();
        console.log(`Loaded ${allVehicles.length} vehicles.`);
        
        // Find if any field value contains Spanish status terms
        const targetTerms = ["DESPACHADO", "AGENCIA", "PERDIDA", "CHAPISTERIA", "MECANICA", "VENTAS", "REVISION"];
        const foundPaths = new Set();
        
        const traverse = (obj, path = "") => {
            if (!obj) return;
            if (typeof obj === "string") {
                const upper = obj.toUpperCase();
                for (const term of targetTerms) {
                    if (upper.includes(term)) {
                        foundPaths.add(`${path}: "${obj}"`);
                    }
                }
            } else if (typeof obj === "object") {
                for (const key of Object.keys(obj)) {
                    traverse(obj[key], path ? `${path}.${key}` : key);
                }
            }
        };

        allVehicles.forEach(v => {
            traverse(v);
        });

        console.log("Matching paths found:", Array.from(foundPaths));
        
        // Let's also print unique values of some fields if no match
        if (foundPaths.size === 0) {
            console.log("No exact match found in any field. Let's inspect unique values for status and basic details category/condition/etc.");
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();

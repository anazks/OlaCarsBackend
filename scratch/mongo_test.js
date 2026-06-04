require('dotenv').config({path: '../.env'});
const mongoose = require('mongoose');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function testMongo() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");
        
        const code = await AccountingCode.findOne();
        console.log("Original Code:", code.code);
        
        const newCode = code.code + "88";
        console.log("Updating to:", newCode);
        
        const updated = await AccountingCode.findByIdAndUpdate(code._id, { code: newCode, name: code.name + " DBTest" }, { new: true, runValidators: true });
        console.log("Updated Code Result:", updated.code);
        console.log("Updated Name Result:", updated.name);
        
        // Revert
        await AccountingCode.findByIdAndUpdate(code._id, { code: code.code, name: code.name }, { new: true, runValidators: true });
        console.log("Reverted successfully");
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}
testMongo();

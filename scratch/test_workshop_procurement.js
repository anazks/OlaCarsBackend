const mongoose = require("mongoose");
const FinanceAdmin = require("../Src/modules/FinanceAdmin/model/FinanceAdminModel.js");
const jwt = require("jsonwebtoken");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find the finance admin
    const admin = await FinanceAdmin.findOne({ email: "financialadmin@olacars.com" });
    if (!admin) {
        console.error("Finance admin financialadmin@olacars.com not found!");
        process.exit(1);
    }
    
    // Generate JWT token
    const token = jwt.sign(
        { id: admin._id, role: "FINANCEADMIN" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );
    
    console.log("Generated Token:", token);
    
    try {
        const response = await fetch("http://localhost:3000/api/workshop-procurement", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json();
        console.log("Success! Status code:", response.status);
        console.log("Data returned:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error fetching:", err);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
require("dotenv").config();

const Admin = require("../Src/modules/Admin/Model/adminModel");

async function debugAdmin() {
  try {
    await connectDB();
    console.log("Connected...");
    const admin = await Admin.findOne({ email: "admin@gmail.com" }).lean();
    console.log("Admin Data:", JSON.stringify(admin, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

debugAdmin();

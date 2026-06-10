const mongoose = require("mongoose");
require("dotenv").config();

async function testConnection() {
  try {
    console.log("Attempting to connect to:", process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log("Successfully connected to MongoDB!");
    process.exit(0);
  } catch (error) {
    console.error("Connection failed with error:");
    console.error(error);
    process.exit(1);
  }
}

testConnection();

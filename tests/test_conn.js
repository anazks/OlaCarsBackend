const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function testConn() {
  console.log("Connecting...");
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected!");
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

testConn();

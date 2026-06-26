const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
require("dotenv").config();

const SystemSettings = require("../Src/modules/SystemSettings/Model/SystemSettingsModel");

async function checkSetting() {
  try {
    await connectDB();
    const setting = await SystemSettings.findOne({ key: 'invoice_generation_day' });
    console.log("SETTING_VALUE:", setting ? setting.value : "DEFAULT (3)");
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

checkSetting();

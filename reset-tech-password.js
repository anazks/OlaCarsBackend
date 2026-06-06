const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

dotenv.config();
(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.error("MONGO_URI missing");
      process.exit(1);
    }
    await mongoose.connect(uri);
    const WorkshopStaff = require("./Src/modules/WorkshopStaff/Model/WorkshopStaffModel.js");
    const email = "technician@olacars.com";
    const staff = await WorkshopStaff.findOne({ email, isDeleted: false });
    if (!staff) {
      console.error("WorkshopStaff not found for email", email);
      process.exit(1);
    }
    console.log(
      "Found staff:",
      staff._id.toString(),
      staff.email,
      staff.status,
      "role",
      staff.role,
    );
    const newPassword = "Test@1234";
    const newHash = await bcrypt.hash(newPassword, 12);
    staff.passwordHash = newHash;
    staff.failedLoginAttempts = 0;
    staff.lockUntil = undefined;
    staff.status = "ACTIVE";
    await staff.save();
    console.log("Password reset to", newPassword, "and status set to ACTIVE");
    console.log("Stored hash", staff.passwordHash);
    const match = await bcrypt.compare(newPassword, staff.passwordHash);
    console.log("Verify compare:", match);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();

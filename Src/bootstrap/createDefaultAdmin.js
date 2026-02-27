const bcrypt = require("bcryptjs");
const Admin = require("../modules/Admin/model/adminModel.js");

const createDefaultAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({
      email: process.env.DEFAULT_ADMIN_EMAIL,
    });

    if (existingAdmin) {
      console.log("Default admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.DEFAULT_ADMIN_PASSWORD,
      12
    );

    await Admin.create({
      fullName: "System Administrator",
      email: process.env.DEFAULT_ADMIN_EMAIL,
      passwordHash: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE",
      isDeleted: false,
    });

    console.log("Default admin created successfully");
  } catch (error) {
    console.error("Error creating default admin:", error);
  }
};

module.exports = { createDefaultAdmin };
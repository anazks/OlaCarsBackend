import bcrypt from "bcryptjs";
import Admin from "../modules/Admin/model/adminModel.js";

export const createDefaultAdmin = async () => {
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
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    console.log("Default admin created successfully");
  } catch (error) {
    console.error("Error creating default admin:", error);
  }
};
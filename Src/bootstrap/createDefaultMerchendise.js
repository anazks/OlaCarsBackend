const bcrypt = require("bcryptjs");
const Merchendise = require("../modules/Merchendise/Model/MerchendiseModel.js");
const RoleTemplate = require("../modules/AccessControl/Model/RoleTemplate.js");

const createDefaultMerchendise = async () => {
  try {
    const email = "merchandiser@olacars.com";

    // Seed/Update Role Template for MERCHENDISE
    let template = await RoleTemplate.findOne({ roleName: "MERCHENDISE" });
    if (!template) {
      await RoleTemplate.create({
        roleName: "MERCHENDISE",
        permissions: ["PURCHASE_ORDER_VIEW", "PURCHASE_ORDER_EDIT"],
        description: "Standard merchandiser permissions including Purchase Order viewing/editing."
      });
      console.log("Created RoleTemplate: MERCHENDISE");
    } else {
      const currentPerms = template.permissions || [];
      if (!currentPerms.includes("PURCHASE_ORDER_VIEW")) {
        template.permissions = [...new Set([...currentPerms, "PURCHASE_ORDER_VIEW", "PURCHASE_ORDER_EDIT"])];
        await template.save();
        console.log("Updated RoleTemplate: MERCHENDISE");
      }
    }

    const existing = await Merchendise.findOne({ email });

    if (existing) {
      console.log("Default merchandiser already exists");
      if (!existing.permissions || !existing.permissions.includes("PURCHASE_ORDER_VIEW")) {
        existing.permissions = ["PURCHASE_ORDER_VIEW", "PURCHASE_ORDER_EDIT"];
        await existing.save();
        console.log("Updated default merchandiser user permissions");
      }
      return;
    }

    const hashedPassword = await bcrypt.hash("password123", 12);

    await Merchendise.create({
      fullName: "Vikrant Verma",
      email: email,
      passwordHash: hashedPassword,
      role: "MERCHENDISE",
      status: "ACTIVE",
      isDeleted: false,
      permissions: ["PURCHASE_ORDER_VIEW", "PURCHASE_ORDER_EDIT"]
    });

    console.log("Default merchandiser created successfully");
  } catch (error) {
    console.error("Error creating default merchandiser:", error);
  }
};

module.exports = { createDefaultMerchendise };

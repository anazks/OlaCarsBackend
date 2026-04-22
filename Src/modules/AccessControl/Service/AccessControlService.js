const mongoose = require("mongoose");
const RoleTemplate = require("../Model/RoleTemplate");
const { ALL_PERMISSIONS } = require("../Constants/permissions");
const AppError = require("../../../shared/utils/AppError");

exports.getAllPermissions = () => {
  return ALL_PERMISSIONS;
};

exports.getRoleTemplates = async () => {
  return await RoleTemplate.find();
};

exports.createOrUpdateRoleTemplate = async (roleName, permissions, creatorId, creatorRole) => {
  // Validate permissions
  const invalidPerms = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    throw new AppError(`Invalid permissions provided: ${invalidPerms.join(", ")}`, 400);
  }

  const template = await RoleTemplate.findOneAndUpdate(
    { roleName: roleName.toUpperCase() },
    {
      permissions,
      createdBy: creatorId,
      creatorRole: creatorRole,
    },
    { new: true, upsert: true }
  );

  return template;
};

exports.getPermissionsForRole = async (roleName) => {
  const template = await RoleTemplate.findOne({ roleName: roleName.toUpperCase() });
  return template ? template.permissions : [];
};

exports.createMultipleRoleTemplates = async (templates) => {
  const results = [];
  for (const t of templates) {
    const res = await this.createOrUpdateRoleTemplate(t.roleName, t.permissions, t.creatorId, t.creatorRole);
    results.push(res);
  }
  return results;
};

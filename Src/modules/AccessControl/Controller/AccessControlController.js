const AccessControlService = require("../Service/AccessControlService");

exports.listAllAvailablePermissions = async (req, res, next) => {
  try {
    const permissions = AccessControlService.getAllPermissions();
    return res.status(200).json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    next(error);
  }
};

exports.getRoleTemplates = async (req, res, next) => {
  try {
    const templates = await AccessControlService.getRoleTemplates();
    return res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};

exports.upsertRoleTemplate = async (req, res, next) => {
  try {
    const { roleName, permissions } = req.body;
    const creatorId = req.user.id;
    const creatorRole = req.user.role;

    const template = await AccessControlService.createOrUpdateRoleTemplate(
      roleName,
      permissions,
      creatorId,
      creatorRole
    );

    return res.status(200).json({
      success: true,
      message: "Role template updated successfully",
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

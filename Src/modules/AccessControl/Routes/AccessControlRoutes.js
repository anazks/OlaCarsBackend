const express = require("express");
const router = express.Router();
const {
  listAllAvailablePermissions,
  getRoleTemplates,
  upsertRoleTemplate,
} = require("../Controller/AccessControlController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");

// All access control routes are restricted to ADMIN for the configuration phase
router.use(authenticate);
router.use(hasPermission("ACCESS_CONTROL_MANAGE"));

/**
 * @swagger
 * /api/access-control/permissions:
 *   get:
 *     summary: List all granular permissions available in the system
 *     tags: [AccessControl]
 *     security:
 *       - bearerAuth: []
 */
router.get("/permissions", listAllAvailablePermissions);

/**
 * @swagger
 * /api/access-control/templates:
 *   get:
 *     summary: Get all standard permissions for each role
 *     tags: [AccessControl]
 *     security:
 *       - bearerAuth: []
 */
router.get("/templates", getRoleTemplates);

/**
 * @swagger
 * /api/access-control/templates:
 *   post:
 *     summary: Update the standard permissions for a role
 *     tags: [AccessControl]
 *     security:
 *       - bearerAuth: []
 */
router.post("/templates", upsertRoleTemplate);

module.exports = router;

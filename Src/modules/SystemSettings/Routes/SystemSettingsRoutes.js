const express = require("express");
const router = express.Router();
const { getSystemSetting, updateSystemSetting, listSystemSettings } = require("../Controller/SystemSettingsController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * @swagger
 * tags:
 *   name: SystemSettings
 *   description: Global system configuration settings.
 */

/**
 * @swagger
 * /api/system-settings/{key}:
 *   get:
 *     summary: Get a system setting by key
 *     description: Retrieves the value of a specific system configuration.
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The configuration key (e.g., poApprovalThreshold)
 *     responses:
 *       200:
 *         description: Setting value retrieved
 */
/**
 * @swagger
 * /api/system-settings:
 *   get:
 *     summary: List all system settings
 *     description: Returns an array of all configuration items currently in the database.
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of settings retrieved
 */
router.get("/", authenticate, hasPermission("SYSTEM_SETTINGS_VIEW"), listSystemSettings);

router.get("/:key", authenticate, hasPermission("SYSTEM_SETTINGS_VIEW"), getSystemSetting);

/**
 * @swagger
 * /api/system-settings/{key}:
 *   put:
 *     summary: Update or create a system setting
 *     description: Set the value for a specific configuration key.
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The configuration key to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: any
 *                 description: The value to set (can be number, string, object, etc.)
 *     responses:
 *       200:
 *         description: Setting updated successfully
 */
router.put("/:key", authenticate, authorize(ROLES.ADMIN, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER), hasPermission("SYSTEM_SETTINGS_EDIT"), updateSystemSetting);

module.exports = router;

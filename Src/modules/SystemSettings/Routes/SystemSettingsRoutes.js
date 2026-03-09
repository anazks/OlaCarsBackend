const express = require("express");
const router = express.Router();
const { getPOThreshold, updatePOThreshold } = require("../Controller/SystemSettingsController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * @swagger
 * tags:
 *   name: SystemSettings
 *   description: Global system configuration settings.
 */

/**
 * @swagger
 * /api/system-settings/po-threshold:
 *   get:
 *     summary: Get the dynamic PO threshold
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current threshold value
 */
router.get("/po-threshold", authenticate, getPOThreshold);

/**
 * @swagger
 * /api/system-settings/po-threshold:
 *   put:
 *     summary: Update the dynamic PO threshold
 *     description: Set the limit above which only ADMIN can approve Purchase Orders.
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - threshold
 *             properties:
 *               threshold:
 *                 type: number
 *                 example: 1500
 *     responses:
 *       200:
 *         description: Threshold updated successfully
 */
router.put("/po-threshold", authenticate, authorize(ROLES.ADMIN), updatePOThreshold);

module.exports = router;

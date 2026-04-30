const express = require("express");
const router = express.Router();
const { getPerformance } = require("../Controller/staffPerformanceController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * @swagger
 * tags:
 *   name: Staff Performance
 *   description: Tracking finance and operation staff onboarding performance
 */

/**
 * @swagger
 * /api/staff-performance:
 *   get:
 *     summary: Get performance metrics for staff members
 *     tags: [Staff Performance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: Filter by branch ObjectId
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, finance, operation]
 *         description: Filter by staff type
 *     responses:
 *       200:
 *         description: Performance metrics aggregated from statusHistory
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_PERFORMANCE_VIEW"),
    getPerformance
);

// Targets
const targetController = require("../Controller/targetController");
router.post(
    "/targets",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN),
    targetController.assignTarget
);

router.get(
    "/targets",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN),
    targetController.getTargets
);

// Tasks
const taskController = require("../Controller/taskController");
router.post(
    "/tasks",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN),
    taskController.delegateTask
);

router.patch(
    "/tasks/:taskId/status",
    authenticate,
    taskController.updateTaskStatus
);

router.get(
    "/tasks",
    authenticate,
    taskController.getTasks
);

module.exports = router;

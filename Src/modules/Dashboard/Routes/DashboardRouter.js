const express = require("express");
const router = express.Router();
const DashboardController = require("../Controller/DashboardController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const FINANCE_ROLES = [
    ROLES.ADMIN, 
    ROLES.FINANCEADMIN, 
    ROLES.COUNTRYMANAGER, 
    ROLES.BRANCHMANAGER
];

const WORKSHOP_ROLES = [
    ROLES.ADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
    ROLES.WORKSHOPMANAGER,
    ROLES.WORKSHOPSTAFF
];

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Analytical Dashboards for Finance and Operations Executives
 */

/**
 * @swagger
 * /api/dashboard/financial-summary:
 *   get:
 *     summary: Retrieve Complete Financial Admin Dashboard Data
 *     description: Returns stats like active vehicles, driver count, monthly revenue, pending collections, system alerts counts, collection compliance rates, revenue trend graphs, and overdue payment list.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter results generated on or after date (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter results generated on or before date (YYYY-MM-DD).
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter dashboard globally by target operating country.
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: Specific Branch ID filter.
 *     responses:
 *       200:
 *         description: Aggregated financial dashboard insights returned successfully.
 *       401:
 *         description: Not authorized.
 *       500:
 *         description: Server breakdown.
 */
router.get("/financial-summary", authorize(...FINANCE_ROLES), DashboardController.getFinancialDashboardSummary);

/**
 * @swagger
 * /api/dashboard/vehicle-movement:
 *   get:
 *     summary: Fetch Vehicles Movement Analysis Over Time
 *     description: Analyzes daily activity logs to tabulate fleet removals, rental returns, and active new rentals.
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Timeseries analytics for vehicle events.
 */
router.get("/vehicle-movement", authorize(...FINANCE_ROLES), DashboardController.getVehicleMovementData);

/**
 * @swagger
 * /api/dashboard/workshop-analytics:
 *   get:
 *     summary: Retrieve Workshop Dashboard Analytics
 *     description: Returns work order trends and stock health metrics for the workshop dashboard.
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Workshop analytics returned successfully.
 */
router.get("/workshop-analytics", authorize(...WORKSHOP_ROLES), DashboardController.getWorkshopDashboardAnalytics);

module.exports = router;

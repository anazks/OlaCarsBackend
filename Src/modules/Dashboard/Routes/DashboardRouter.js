const express = require("express");
const router = express.Router();
const DashboardController = require("../Controller/DashboardController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const ALLOWED_ROLES = [
    ROLES.ADMIN, 
    ROLES.FINANCEADMIN, 
    ROLES.COUNTRYMANAGER, 
    ROLES.BRANCHMANAGER
];

router.use(authenticate);
router.use(authorize(...ALLOWED_ROLES));

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalActiveVehicles: { type: integer, example: 2482 }
 *                         monthlyRevenue: { type: number, example: 1820000 }
 *                         outstandingCollections: { type: number, example: 142300 }
 *                         activeDrivers: { type: integer, example: 1964 }
 *                         collectionCompliance: { type: integer, example: 94 }
 *                         last12MonthsRevenue: { type: number, example: 21840 }
 *                         outstandingBalance: { type: number, example: 29880 }
 *                     alerts:
 *                       type: object
 *                       properties:
 *                         CRITICAL: { type: integer, example: 2 }
 *                         MAJOR: { type: integer, example: 1 }
 *                         MINOR: { type: integer, example: 1 }
 *                     fleetStatus:
 *                       type: object
 *                       properties:
 *                         available: { type: integer, example: 1420 }
 *                         rented: { type: integer, example: 820 }
 *                         maintenance: { type: integer, example: 182 }
 *                         retired: { type: integer, example: 60 }
 *                     totalVehicles: { type: integer, example: 2482 }
 *                     revenueOverview:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string, example: "Jan" }
 *                           currentYear: { type: number }
 *                           previousYear: { type: number }
 *                     overduePayments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           customerName: { type: string }
 *                           vehicleNumber: { type: string }
 *                           amount: { type: number }
 *                           daysOverdue: { type: integer }
 *       401:
 *         description: Not authorized.
 *       500:
 *         description: Server breakdown.
 */
router.get("/financial-summary", DashboardController.getFinancialDashboardSummary);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date: { type: string, example: "2026-04-12" }
 *                       removed: { type: integer }
 *                       returned: { type: integer }
 *                       sale: { type: integer }
 */
router.get("/vehicle-movement", DashboardController.getVehicleMovementData);

module.exports = router;

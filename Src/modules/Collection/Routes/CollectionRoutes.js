const express = require("express");
const router = express.Router();

const { getCollectionsOverview, getCollectionsList } = require("../Controller/CollectionController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * @swagger
 * tags:
 *   name: Collections
 *   description: Revenue collection tracking, forecast, and analytics API
 */

/**
 * @swagger
 * /api/collections/overview:
 *   get:
 *     summary: Retrieve overarching metrics, overdue logs, and upcoming forecasts
 *     description: Yields consolidated summaries of total billed, collected, and overdue payments. Access is implicitly scoped by user roles.
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter results by specific country
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: Filter results by specific branch ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Range start filter (YYYY-MM-DD) for invoice due dates
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Range end filter (YYYY-MM-DD) for invoice due dates
 *     responses:
 *       200:
 *         description: Metrics collected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         totalInvoiced:
 *                           type: number
 *                         totalCollected:
 *                           type: number
 *                         pendingCollected:
 *                           type: number
 *                         overdueAmount:
 *                           type: number
 *                         forecastAmount:
 *                           type: number
 *                         mtdCollected:
 *                           type: number
 *                     trend:
 *                       type: array
 *                       items:
 *                         type: object
 *                     recentOverdue:
 *                       type: array
 *                       items:
 *                         type: object
 *                     upcomingPayments:
 *                       type: array
 *                       items:
 *                         type: object
 *       403:
 *         description: Restricted from Category 3 (Workshop) or unauthorized access.
 */
router.get(
    "/overview",
    authenticate,
    authorize(
        ROLES.ADMIN,
        ROLES.FINANCEADMIN,
        ROLES.OPERATIONADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER,
        ROLES.FINANCESTAFF,
        ROLES.OPERATIONSTAFF
    ),
    getCollectionsOverview
);

/**
 * @swagger
 * /api/collections/list:
 *   get:
 *     summary: Fetch detailed list of matching Invoices for collections reporting
 *     description: Returns paginated records filtering by status, dates, search terms, and implicit role boundaries.
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PARTIAL, PAID, OVERDUE, CANCELLED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search string matching Driver Name, Plate Number, Invoice ID or Fleet.
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *     responses:
 *       200:
 *         description: List returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 */
router.get(
    "/list",
    authenticate,
    authorize(
        ROLES.ADMIN,
        ROLES.FINANCEADMIN,
        ROLES.OPERATIONADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER,
        ROLES.FINANCESTAFF,
        ROLES.OPERATIONSTAFF
    ),
    getCollectionsList
);

module.exports = router;

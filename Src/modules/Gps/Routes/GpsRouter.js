const express = require("express");
const router = express.Router();
const GpsController = require("../Controller/GpsController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const ALLOWED_ROLES = [
    ROLES.ADMIN, 
    ROLES.FINANCEADMIN, 
    ROLES.OPERATIONADMIN, 
    ROLES.COUNTRYMANAGER, 
    ROLES.BRANCHMANAGER,
    ROLES.WORKSHOPSTAFF,
    ROLES.WORKSHOPMANAGER
];

/**
 * @swagger
 * /api/gps/vehicles:
 *   get:
 *     summary: Retrieve list of all vehicles connected to Tracksolid GPS
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of GPS vehicles retrieved successfully
 *       401:
 *         description: Unauthorized access token
 *       403:
 *         description: Insufficient role permissions
 */
router.get("/vehicles", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsVehicles);

/**
 * @swagger
 * /api/gps/locations:
 *   get:
 *     summary: Retrieve real-time positions for given or all GPS vehicles
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: imeis
 *         schema:
 *           type: string
 *         description: Comma-separated list of device IMEIs
 *     responses:
 *       200:
 *         description: Fleet locations list retrieved successfully
 */
router.get("/locations", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsLocations);

/**
 * @swagger
 * /api/gps/live-stream:
 *   get:
 *     summary: Retrieve live streaming page URL for a GPS device
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *     responses:
 *       200:
 *         description: Live stream URL retrieved successfully
 *       400:
 *         description: IMEI is required
 *       404:
 *         description: No live stream URL returned
 *       500:
 *         description: Failed to retrieve live streaming URL
 */
router.get("/live-stream", authenticate, authorize(...ALLOWED_ROLES), GpsController.getDeviceLiveStream);

/**
 * @swagger
 * /api/gps/media-event:
 *   get:
 *     summary: Retrieve media event page URL for a GPS device
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *     responses:
 *       200:
 *         description: Media event URL retrieved successfully
 *       400:
 *         description: IMEI is required
 *       404:
 *         description: No media event URL returned
 *       500:
 *         description: Failed to retrieve media event URL
 */
router.get("/media-event", authenticate, authorize(...ALLOWED_ROLES), GpsController.getDeviceMediaEvent);
router.get("/trips-report", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsTripsReport);
router.get("/mileage", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsMileage);
router.get("/track", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsTrackList);
router.get("/notifications", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsNotifications);
router.post("/webhook", GpsController.receiveGpsNotification);
router.get("/obd", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsObdData);
router.get("/fleet-summary-report", authenticate, authorize(...ALLOWED_ROLES), GpsController.getFleetSummaryReport);

module.exports = router;


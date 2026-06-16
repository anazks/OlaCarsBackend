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
    ROLES.BRANCHMANAGER
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
 *         description: List of GPS vehicles
 */
router.get("/vehicles", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsVehicles);

/**
 * @swagger
 * /api/gps/locations:
 *   get:
 *     summary: Retrieve GPS locations
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: imeis
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of GPS locations
 */
router.get("/locations", authenticate, authorize(...ALLOWED_ROLES), GpsController.getGpsLocations);

/**
 * @swagger
 * /api/gps/live-stream:
 *   get:
 *     summary: Retrieve Live Stream URL
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: imei
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Live stream url
 */
router.get("/live-stream", authenticate, authorize(...ALLOWED_ROLES), GpsController.getDeviceLiveStream);

/**
 * @swagger
 * /api/gps/media-event:
 *   get:
 *     summary: Retrieve Media Event URL
 *     tags: [GPS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: imei
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Media Event URL
 */
router.get("/media-event", authenticate, authorize(...ALLOWED_ROLES), GpsController.getDeviceMediaEvent);

module.exports = router;

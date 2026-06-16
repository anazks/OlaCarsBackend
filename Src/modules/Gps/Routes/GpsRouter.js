const express = require("express");
const router = express.Router();
const { getGpsVehicles, getGpsLocations,GpsController, getDeviceLiveStreamingUrl, getDeviceMediaEventUrl } = require("../Controller/GpsController");
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
 *         description: List of GPS vehicles retrieved successfully
 *       401:
 *         description: Unauthorized access token
 *       403:
 *         description: Insufficient role permissions
 */
router.get("/vehicles", authenticate, authorize(ROLES.ADMIN, ROLES.FINANCEADMIN), getGpsVehicles);

/**
 * @swagger
 * /api/gps/locations:
 *   get:
 *     summary: Retrieve GPS locations
 *     summary: Retrieve real-time positions for given or all GPS vehicles
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
 *         description: Comma-separated list of device IMEIs
 *     responses:
 *       200:
 *         description: Fleet locations list retrieved successfully
 */
router.get("/locations", authenticate, authorize(ROLES.ADMIN, ROLES.FINANCEADMIN), getGpsLocations);

/**
 * @swagger
 * /api/gps/live-stream:
 *   get:
 *     summary: Retrieve Live Stream URL
 *     summary: Retrieve live streaming page URL for a GPS device
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
router.get("/live-stream", authenticate, authorize(ROLES.ADMIN, ROLES.FINANCEADMIN), getDeviceLiveStreamingUrl);

/**
 * @swagger
 * /api/gps/media-event:
 *   get:
 *     summary: Retrieve Media Event URL
 *     summary: Retrieve media event page URL for a GPS device
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
router.get("/media-event", authenticate, authorize(ROLES.ADMIN, ROLES.FINANCEADMIN), getDeviceMediaEventUrl);

module.exports = router;

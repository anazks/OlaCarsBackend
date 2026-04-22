const express = require("express");
const router = express.Router();
const aiController = require("../Controller/AiController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");

/**
 * Public routes for AI Call Service.
 * These routes do not require authentication as per the requirement.
 */

// Get available vehicles for booking
router.get("/vehicles/available", authenticate, hasPermission("AI_SERVICE_ACCESS"), aiController.getAvailableVehicles);

// Pre-book a vehicle for a driver
router.post("/vehicles/book", authenticate, hasPermission("AI_SERVICE_ACCESS"), aiController.bookVehicle);

module.exports = router;

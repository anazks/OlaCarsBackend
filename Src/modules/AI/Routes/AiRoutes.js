const express = require("express");
const router = express.Router();
const aiController = require("../Controller/AiController");

/**
 * Public routes for AI Call Service.
 * These routes do not require authentication as per the requirement.
 */

// Get available vehicles for booking
router.get("/vehicles/available", aiController.getAvailableVehicles);

// Pre-book a vehicle for a driver
router.post("/vehicles/book", aiController.bookVehicle);

module.exports = router;

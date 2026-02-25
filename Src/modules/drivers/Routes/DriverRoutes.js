const express = require("express");
const router = express.Router();
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { addDriver, editDriver, deleteDriver, getAllDrivers } = require("../Controller/driverController");


router.post("/addDriver", authenticate, authorize("SUPER_ADMIN"), addDriver);
router.put("/editDriver", authenticate, authorize("SUPER_ADMIN"), editDriver);
router.delete("/deleteDriver", authenticate, authorize("SUPER_ADMIN"), deleteDriver);
router.get("/getAllDrivers", authenticate, authorize("SUPER_ADMIN"),getAllDrivers);

module.exports = router;
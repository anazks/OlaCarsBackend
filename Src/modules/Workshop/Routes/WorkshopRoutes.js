const express = require("express");
const router = express.Router();
const {
  addWorkshop,
  getWorkshops,
  getWorkshopById,
  editWorkshop,
  deleteWorkshop,
} = require("../Controller/WorkshopController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const {
  authenticate,
} = require("../../../shared/middlewares/authMiddleware.js");
const {
  hasPermission,
} = require("../../../shared/middlewares/permissionMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
  addWorkshopSchema,
  editWorkshopSchema,
  deleteWorkshopSchema,
  getWorkshopByIdSchema,
} = require("../Validation/WorkshopValidation.js");

/**
 * @swagger
 * tags:
 *   name: Workshop
 *   description: Workshop APIs
 */

router.post(
  "/",
  authenticate,
  authorize(
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
  ),
  hasPermission("WORKSHOP_CREATE"),
  validate(addWorkshopSchema),
  addWorkshop,
);

router.get(
  "/",
  authenticate,
  authorize(
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
    ROLES.FINANCEADMIN,
    ROLES.OPERATIONSTAFF,
  ),
  hasPermission("WORKSHOP_VIEW"),
  getWorkshops,
);

router.get(
  "/:id",
  authenticate,
  authorize(
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
    ROLES.FINANCEADMIN,
    ROLES.OPERATIONSTAFF,
  ),
  hasPermission("WORKSHOP_VIEW"),
  validate(getWorkshopByIdSchema),
  getWorkshopById,
);

router.put(
  "/:id",
  authenticate,
  authorize(
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
  ),
  hasPermission("WORKSHOP_EDIT"),
  validate(editWorkshopSchema),
  editWorkshop,
);

router.delete(
  "/:id",
  authenticate,
  authorize(
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
  ),
  hasPermission("WORKSHOP_DELETE"),
  validate(deleteWorkshopSchema),
  deleteWorkshop,
);

module.exports = router;

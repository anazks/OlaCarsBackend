const express = require("express");
const router = express.Router();
const {
    addWorkshopManager,
    editWorkshopManager,
    deleteWorkshopManager,
    getWorkshopManagers,
    getWorkshopManagerById,
    login
} = require("../Controller/WorkshopManagerController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addWorkshopManagerSchema,
    editWorkshopManagerSchema,
} = require("../Validation/WorkshopManagerValidation.js");

/**
 * @swagger
 * tags:
 *   name: WorkshopManager
 *   description: Workshop Manager APIs
 */

/**
 * @swagger
 * /api/workshop-manager/login:
 *   post:
 *     summary: Workshop Manager login
 *     tags: [WorkshopManager]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@olacars.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword@123"
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", validate(loginSchema), login);

/**
 * @swagger
 * /api/workshop-manager:
 *   post:
 *     summary: Create new Workshop Manager
 *     tags: [WorkshopManager]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - branchId
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 example: "user@olacars.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword@123"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               branchId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Manager created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(addWorkshopManagerSchema),
    addWorkshopManager
);

/**
 * @swagger
 * /api/workshop-manager:
 *   get:
 *     summary: Get all Workshop Managers
 *     tags: [WorkshopManager]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Workshop Managers
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    getWorkshopManagers
);

/**
 * @swagger
 * /api/workshop-manager/{id}:
 *   get:
 *     summary: Get Workshop Manager by ID
 *     tags: [WorkshopManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Manager details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    getWorkshopManagerById
);

/**
 * @swagger
 * /api/workshop-manager/{id}:
 *   put:
 *     summary: Update Workshop Manager
 *     tags: [WorkshopManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 example: "user@olacars.com"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       200:
 *         description: Manager updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(editWorkshopManagerSchema),
    editWorkshopManager
);

/**
 * @swagger
 * /api/workshop-manager/{id}:
 *   delete:
 *     summary: Soft Delete Workshop Manager
 *     tags: [WorkshopManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Manager deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    deleteWorkshopManager
);

module.exports = router;

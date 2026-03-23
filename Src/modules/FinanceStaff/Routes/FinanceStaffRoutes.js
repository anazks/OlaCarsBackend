const express = require("express");
const router = express.Router();
const {
    addFinanceStaff,
    editFinanceStaff,
    changePassword,
    deleteFinanceStaff,
    getFinanceStaff,
    getFinanceStaffById,
    login
} = require("../Controller/FinanceStaffController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addFinanceStaffSchema,
    editFinanceStaffSchema,
    changePasswordSchema,
    deleteFinanceStaffSchema,
    getFinanceStaffByIdSchema,
} = require("../Validation/FinanceStaffValidation.js");

/**
 * @swagger
 * tags:
 *   name: FinanceStaff
 *   description: Finance Staff APIs
 */

/**
 * @swagger
 * /api/finance-staff/login:
 *   post:
 *     summary: Finance Staff login
 *     tags: [FinanceStaff]
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", validate(loginSchema), login);

/**
 * @swagger
 * /api/finance-staff:
 *   post:
 *     summary: Create new Finance Staff
 *     tags: [FinanceStaff]
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
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *               branchId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       201:
 *         description: Staff created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    validate(addFinanceStaffSchema),
    addFinanceStaff
);

/**
 * @swagger
 * /api/finance-staff:
 *   get:
 *     summary: Get all Finance Staff
 *     tags: [FinanceStaff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Staff
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    getFinanceStaff
);

/**
 * @swagger
 * /api/finance-staff/{id}:
 *   get:
 *     summary: Get Finance Staff by ID
 *     tags: [FinanceStaff]
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
 *         description: Staff details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    validate(getFinanceStaffByIdSchema),
    getFinanceStaffById
);

/**
 * @swagger
 * /api/finance-staff/{id}:
 *   put:
 *     summary: Update Finance Staff
 *     tags: [FinanceStaff]
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
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *               branchId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       200:
 *         description: Staff updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    validate(editFinanceStaffSchema),
    editFinanceStaff
);

/**
 * @swagger
 * /api/finance-staff/{id}/change-password:
 *   post:
 *     summary: Change Finance Staff password
 *     tags: [FinanceStaff]
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
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post(
    "/:id/change-password",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    validate(changePasswordSchema),
    changePassword
);

/**
 * @swagger
 * /api/finance-staff/{id}:
 *   delete:
 *     summary: Soft Delete Finance Staff
 *     tags: [FinanceStaff]
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
 *         description: Staff deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    validate(deleteFinanceStaffSchema),
    deleteFinanceStaff
);

module.exports = router;

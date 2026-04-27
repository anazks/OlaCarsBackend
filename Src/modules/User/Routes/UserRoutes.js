const express = require("express");
const router = express.Router();
const {
    addUser,
    editUser,
    changePassword,
    deleteUser,
    getUsers,
    getUserById,
    getProfile,
    login
} = require("../Controller/UserController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: User
 *   description: User Management APIs
 */

/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: User login
 *     tags: [User]
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
router.post("/login", login);

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile details
 */
router.get("/profile", authenticate, getProfile);

/**
 * @swagger
 * /api/user:
 *   post:
 *     summary: Register a new user
 *     tags: [User]
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
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF),
    hasPermission("USER_CREATE"),
    addUser
);

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Get all users
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/", authenticate, hasPermission("USER_VIEW"), getUsers);

/**
 * @swagger
 * /api/user/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [User]
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
 *         description: User details
 */
router.get("/:id", authenticate, hasPermission("USER_VIEW"), getUserById);

/**
 * @swagger
 * /api/user/{id}:
 *   put:
 *     summary: Update User
 *     tags: [User]
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
 *               password:
 *                 type: string
 *                 example: "StrongPassword@123"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       200:
 *         description: User updated successfully
 */
router.put("/:id", authenticate, hasPermission("USER_EDIT"), editUser);

/**
 * @swagger
 * /api/user/{id}/change-password:
 *   post:
 *     summary: Change User password
 *     tags: [User]
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
 *                 example: "OldPassword@123"
 *               newPassword:
 *                 type: string
 *                 example: "NewStrongPassword@123"
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post("/:id/change-password", authenticate, changePassword);

/**
 * @swagger
 * /api/user/{id}:
 *   delete:
 *     summary: Soft Delete User
 *     tags: [User]
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
 *         description: User deleted successfully
 */
router.delete("/:id", authenticate, hasPermission("USER_DELETE"), deleteUser);

module.exports = router;

const express = require("express");
const router = express.Router();

const { addBranch,editBranch,deleteBranch } = require("../Controller/BranchController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");

/**
 * @swagger
 * tags:
 *   name: Branch
 *   description: Branch Management APIs
 */

/**
 * @swagger
 * /admin/branch:
 *   post:
 *     summary: Create new branch (SUPER_ADMIN only)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *               - address
 *               - city
 *               - state
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *                 example: Kochi Main Branch
 *               code:
 *                 type: string
 *                 example: KOCHI01
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       403:
 *         description: Forbidden
 */
router.post(
  "/branch",
  authenticate,
  authorize("SUPER_ADMIN"),
  addBranch
);

/**
 * @swagger
 * /admin/branch:
 *   get:
 *     summary: Get all branches (SUPER_ADMIN only)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of branches
 */
router.get(
  "/branch",
  authenticate,
  authorize("SUPER_ADMIN"),
  (req, res) => {
    res.send("Get branches");
  }
);

/**
 * @swagger
 * /admin/branch/{id}:
 *   get:
 *     summary: Get branch by ID
 *     tags: [Branch]
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
 *         description: Branch details
 */
router.get(
  "/branch/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  (req, res) => {
    res.send("Get branch by id");
  }
);

/**
 * @swagger
 * /admin/branch/{id}:
 *   put:
 *     summary: Update branch
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/Updatebranch",
  authenticate,
  authorize("SUPER_ADMIN"),
  editBranch
);

/**
 * @swagger
 * /admin/branch/{id}:
 *   delete:
 *     summary: Delete branch
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/branch/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
 deleteBranch
);

module.exports = router;
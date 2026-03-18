const express = require("express");
const router = express.Router();
const {
    addPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    approvePurchaseOrder,
    editPurchaseOrder,
    uploadPurchaseOrderItemImages,
    getEligiblePurchaseOrdersForBilling,
} = require("../Controller/PurchaseOrderController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const upload = require("../../../utils/multerConfig.js");

/**
 * @swagger
 * tags:
 *   name: PurchaseOrder
 *   description: |
 *     Purchase Order Management — create, approve, reject, and edit POs.
 *
 *     **Workflow:**
 *     - **Create:** CountryManager, BranchManager, OperationStaff, FinanceStaff
 *     - **Approve/Reject (≤ Threshold):** CountryManager, OperationAdmin, FinanceAdmin, Admin
 *     - **Approve/Reject (> Threshold):** Admin only (Default threshold: $1000)
 *     - **Edit:** Original creator or Admin (resets status to WAITING)
 *     - **View:** All authenticated users (scoped by role — creators see own POs, Managers see their branch/country, Admins see all)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PurchaseOrderItem:
 *       type: object
 *       required:
 *         - itemName
 *         - unitPrice
 *       properties:
 *         itemName:
 *           type: string
 *           example: Brake Pads
 *         quantity:
 *           type: number
 *           default: 1
 *           example: 4
 *         description:
 *           type: string
 *           example: Ceramic brake pads for Toyota Corolla
 *         unitPrice:
 *           type: number
 *           example: 45.00
 *         images:
 *           type: array
 *           description: Array of image URLs for the item (max 8)
 *           maxItems: 8
 *           items:
 *             type: string
 *             example: "https://example.com/image.jpg"
 *     PurchaseOrderStatus:
 *       type: string
 *       enum: [WAITING, APPROVED, REJECTED]
 *       description: |
 *         - `WAITING` — Pending approval
 *         - `APPROVED` — Approved by authorized role
 *         - `REJECTED` — Rejected by authorized role
 *     EditHistoryEntry:
 *       type: object
 *       properties:
 *         editedAt:
 *           type: string
 *           format: date-time
 *         editedBy:
 *           type: string
 *           description: User ObjectId
 *         editorRole:
 *           type: string
 *         previousStatus:
 *           type: string
 *         changesSummary:
 *           type: string
 *           example: "Added items: Oil Filter | Updated quantities or prices in items list."
 *     PurchaseOrder:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         purchaseOrderNumber:
 *           type: string
 *           example: PO-1709467200000-A1B2
 *         status:
 *           $ref: '#/components/schemas/PurchaseOrderStatus'
 *         purpose:
 *           type: string
 *           enum: [Vehicle, Spare Parts, Others]
 *           example: Spare Parts
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PurchaseOrderItem'
 *         totalAmount:
 *           type: number
 *           description: Auto-calculated from items (quantity × unitPrice)
 *           example: 180.00
 *         purchaseOrderDate:
 *           type: string
 *           format: date-time
 *         paymentDate:
 *           type: string
 *           format: date-time
 *         branch:
 *           type: string
 *           description: Branch ObjectId (populated in responses)
 *         supplier:
 *           type: string
 *           description: Supplier ObjectId (populated in responses)
 *         createdBy:
 *           type: string
 *           description: Creator's User ObjectId
 *         creatorRole:
 *           type: string
 *           enum: [COUNTRYMANAGER, BRANCHMANAGER, OPERATIONSTAFF, FINANCESTAFF]
 *         approvedBy:
 *           type: string
 *           description: Approver's User ObjectId (null until approved/rejected)
 *         approverRole:
 *           type: string
 *           enum: [COUNTRYMANAGER, OPERATIONADMIN, FINANCEADMIN, ADMIN]
 *         isEdited:
 *           type: boolean
 *           default: false
 *         editHistory:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EditHistoryEntry'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ─── POST /api/purchase-order — Create PO ─────────────────────────────
/**
 * @swagger
 * /api/purchase-order:
 *   post:
 *     summary: Create a new Purchase Order
 *     description: |
 *       Creates a PO with status `WAITING`. 
 *       Accepts JSON normally, OR `multipart/form-data` if uploading images.
 *       If sending images, send `items` as a stringified JSON array, and attach files with keys named `items[0][images]`, `items[1][images]`, etc.
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - purpose
 *               - items
 *               - branch
 *               - supplier
 *             properties:
 *               purpose:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PurchaseOrderItem'
 *               branch:
 *                 type: string
 *               supplier:
 *                 type: string
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - purpose
 *               - items
 *               - branch
 *               - supplier
 *             properties:
 *               purpose:
 *                 type: string
 *               branch:
 *                 type: string
 *               supplier:
 *                 type: string
 *               items:
 *                 type: string
 *                 description: Stringified JSON array of items
 *               items[0][images]:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Images for the first item
 *     responses:
 *       201:
 *         description: PO created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF),
    upload.any(),
    addPurchaseOrder
);

// ─── GET /api/purchase-order — List POs ───────────────────────────────
/**
 * @swagger
 * /api/purchase-order:
 *   get:
 *     summary: List all Purchase Orders (role-filtered)
 *     description: |
 *       Returns POs filtered by the caller's role:
 *
 *       | Role | What they see |
 *       |------|--------------|
 *       | Role | What they see |
 *       |------|--------------|
 *       | **Admin / OpAdmin / FinanceAdmin** | All POs (no filter) |
 *       | **CountryManager** | All POs from branches in their country |
 *       | **BranchManager / Staff** | Only POs they created |
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: purpose
 *         schema:
 *           type: string
 *           enum: [Vehicle, "Spare Parts", Others]
 *         required: false
 *         description: Optional filter to retrieve POs by a specific purpose
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of Purchase Orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PurchaseOrder'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
    "/",
    authenticate,
    getPurchaseOrders
);

// ─── GET /api/purchase-order/eligible-for-billing — List Unbilled POs ─────
/**
 * @swagger
 * /api/purchase-order/eligible-for-billing:
 *   get:
 *     summary: List Purchase Orders eligible for billing (Unbilled & Approved)
 *     description: |
 *       Returns POs that:
 *       1. Are `APPROVED`
 *       2. Have `isBilled: false`
 *       3. Belong to branches in the user's country
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of eligible Purchase Orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PurchaseOrder'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get(
    "/eligible-for-billing",
    authenticate,
    getEligiblePurchaseOrdersForBilling
);

// ─── GET /api/purchase-order/:id — Get single PO ─────────────────────
/**
 * @swagger
 * /api/purchase-order/{id}:
 *   get:
 *     summary: Get a Purchase Order by ID
 *     description: |
 *       Returns full PO details with populated branch, supplier, and creator references.
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: PO ObjectId
 *         schema:
 *           type: string
 *           example: 65f1a2b3c4d5e6f7a8b9c0d3
 *     responses:
 *       200:
 *         description: PO details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseOrder'
 *       404:
 *         description: Purchase Order not found
 */
router.get(
    "/:id",
    authenticate,
    getPurchaseOrderById
);

// ─── PUT /api/purchase-order/:id/approve — Approve or Reject ─────────
/**
 * @swagger
 * /api/purchase-order/{id}/approve:
 *   put:
 *     summary: Approve or Reject a Purchase Order
 *     description: |
 *       Changes a PO's status from `WAITING` to `APPROVED` or `REJECTED`.
 *
 *       **Approval Rules:**
 *
 *       | PO Amount | Who Can Approve/Reject |
 *       |-----------|----------------------|
 *       | **≤ Threshold** | CountryManager, OperationAdmin, FinanceAdmin, Admin |
 *       | **> Threshold** | **Admin only** (Default threshold: $1000) |
 *
 *       - PO must be in `WAITING` status (already processed POs are rejected)
 *       - The approver's ID and role are recorded on the PO
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: PO ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *                 description: Target status
 *           examples:
 *             approve:
 *               summary: Approve PO
 *               value:
 *                 status: APPROVED
 *             reject:
 *               summary: Reject PO
 *               value:
 *                 status: REJECTED
 *     responses:
 *       200:
 *         description: PO status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseOrder'
 *       400:
 *         description: Invalid status or PO already processed
 *         content:
 *           application/json:
 *             examples:
 *               invalidStatus:
 *                 summary: Invalid status value
 *                 value:
 *                   success: false
 *                   message: "Invalid status provided. Must be APPROVED or REJECTED."
 *               alreadyProcessed:
 *                 summary: PO not in WAITING
 *                 value:
 *                   success: false
 *                   message: "Purchase order is already processed."
 *       403:
 *         description: |
 *           Role not authorized — e.g. non-Admin trying to approve a PO over $1,000
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Purchase Orders over threshold can only be approved by ADMIN."
 *       404:
 *         description: PO not found
 */
router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER),
    approvePurchaseOrder
);

// ─── PUT /api/purchase-order/:id — Edit PO ───────────────────────────
/**
 * @swagger
 * /api/purchase-order/{id}:
 *   put:
 *     summary: Edit a Purchase Order
 *     description: |
 *       Edits a PO's items, supplier, or payment date. Automatically:
 *       - **Resets status to `WAITING`** (requires re-approval)
 *       - **Recalculates `totalAmount`** if items are changed
 *       - **Records edit history** with a human-readable changes summary
 *
 *       **Who can edit:** The original creator or Admin only.
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: PO ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 description: Updated items list (replaces existing items entirely)
 *                 items:
 *                   $ref: '#/components/schemas/PurchaseOrderItem'
 *               supplier:
 *                 type: string
 *                 description: New Supplier ObjectId
 *               paymentDate:
 *                 type: string
 *                 format: date-time
 *           example:
 *             items:
 *               - itemName: Brake Pads
 *                 quantity: 6
 *                 description: Increased quantity
 *                 unitPrice: 45.00
 *               - itemName: Oil Filter
 *                 quantity: 2
 *                 unitPrice: 15.00
 *     responses:
 *       200:
 *         description: PO edited, status reset to WAITING, edit history recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseOrder'
 *       403:
 *         description: Not the creator and not Admin
 *       404:
 *         description: PO not found
 */
router.put(
    "/:id",
    authenticate,
    editPurchaseOrder
);

// ─── POST /api/purchase-order/:id/item/:itemId/upload-images — Upload Images ───
/**
 * @swagger
 * /api/purchase-order/{id}/item/{itemId}/upload-images:
 *   post:
 *     summary: Upload images for a specific item in a Purchase Order
 *     description: |
 *       Uploads up to 8 images for a specific PO item to AWS S3.
 *       - Only allows images (jpg, png, jpeg, etc.)
 *       - Max 5MB per file
 *       - Automatically records edit history and resets PO status to `WAITING`
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: PO ObjectId
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: The `_id` of the specific item inside the PO
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Select up to 8 images to upload
 *     responses:
 *       200:
 *         description: Images uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Images uploaded successfully."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "https://bucket.s3.region.amazonaws.com/purchase-orders/..."
 *       400:
 *         description: Bad request (no images, exceeding limits)
 *       403:
 *         description: Unauthorized to edit this PO
 *       404:
 *         description: PO or Item not found
 *       500:
 *         description: Server/S3 error
 */
router.post(
    "/:id/item/:itemId/upload-images",
    authenticate,
    upload.array("images", 8),
    uploadPurchaseOrderItemImages
);

module.exports = router;

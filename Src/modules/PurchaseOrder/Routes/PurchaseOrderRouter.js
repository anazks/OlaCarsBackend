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
    uploadPODocument,
    auditPurchaseOrder,
    bulkUploadPurchaseOrders,
    requestRevision,
    reviewRevision,
    resubmitProposal,
    issueOfficialPO,
} = require("../Controller/PurchaseOrderController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const validate = require("../../../shared/middlewares/validate");
const { ROLES } = require("../../../shared/constants/roles.js");
const {
    addPurchaseOrderSchema,
    approvePurchaseOrderSchema,
    editPurchaseOrderSchema,
    requestRevisionSchema,
    reviewRevisionSchema,
    resubmitProposalSchema,
    issueOfficialPOSchema,
    getPurchaseOrderByIdSchema,
    uploadItemImagesSchema
} = require("../Validation/PurchaseOrderValidation");
const upload = require("../../../utils/multerConfig.js");

// ─── POST /api/purchase-order/bulk-upload ─────────────────────────────
router.post(
    "/bulk-upload",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER),
    hasPermission("PURCHASE_ORDER_CREATE"),
    bulkUploadPurchaseOrders
);

// ─── POST /api/purchase-order — Create PO / Quotation ─────────────────
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.MERCHENDISE),
    hasPermission("PURCHASE_ORDER_CREATE"),
    upload.any(),
    validate(addPurchaseOrderSchema),
    addPurchaseOrder
);

// ─── GET /api/purchase-order/eligible-for-billing ─────────────────────
router.get(
    "/eligible-for-billing",
    authenticate,
    hasPermission("PURCHASE_ORDER_VIEW"),
    getEligiblePurchaseOrdersForBilling
);

// ─── GET /api/purchase-order — List POs ───────────────────────────────
router.get(
    "/",
    authenticate,
    hasPermission("PURCHASE_ORDER_VIEW"),
    getPurchaseOrders
);

// ─── GET /api/purchase-order/:id — Get Single PO ──────────────────────
router.get(
    "/:id",
    authenticate,
    hasPermission("PURCHASE_ORDER_VIEW"),
    validate(getPurchaseOrderByIdSchema),
    getPurchaseOrderById
);

// ─── PUT /api/purchase-order/:id/approve — Approve or Reject ─────────
router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER, ROLES.MERCHENDISE),
    validate(approvePurchaseOrderSchema),
    approvePurchaseOrder
);

// ─── PUT /api/purchase-order/:id/request-revision (Merchandiser) ──────
router.put(
    "/:id/request-revision",
    authenticate,
    validate(requestRevisionSchema),
    requestRevision
);

// ─── PUT /api/purchase-order/:id/review-revision (Finance Admin / Admin) 
router.put(
    "/:id/review-revision",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    validate(reviewRevisionSchema),
    reviewRevision
);

// ─── PUT /api/purchase-order/:id/resubmit-proposal (Merchandiser) ────
router.put(
    "/:id/resubmit-proposal",
    authenticate,
    validate(resubmitProposalSchema),
    resubmitProposal
);

// ─── POST /api/purchase-order/:id/issue-po (Merchandiser Issue Formal PO)
router.post(
    "/:id/issue-po",
    authenticate,
    validate(issueOfficialPOSchema),
    issueOfficialPO
);

// ─── PUT /api/purchase-order/:id — Edit PO ───────────────────────────
router.put(
    "/:id",
    authenticate,
    hasPermission("PURCHASE_ORDER_EDIT"),
    validate(editPurchaseOrderSchema),
    editPurchaseOrder
);

// ─── POST /api/purchase-order/:id/item/:itemId/upload-images ──────────
router.post(
    "/:id/item/:itemId/upload-images",
    authenticate,
    hasPermission("PURCHASE_ORDER_EDIT"),
    validate(uploadItemImagesSchema),
    upload.array("images", 8),
    uploadPurchaseOrderItemImages
);

// ─── POST /api/purchase-order/upload-document ─────────────────────────
router.post(
    "/upload-document",
    authenticate,
    upload.single("document"),
    uploadPODocument
);

// ─── PUT /api/purchase-order/:id/audit ────────────────────────────────
router.put(
    "/:id/audit",
    authenticate,
    hasPermission("PURCHASE_ORDER_EDIT"),
    auditPurchaseOrder
);

module.exports = router;
const express = require("express");
const router = express.Router();
console.log("[DEBUG] WorkshopProcurementRouter loaded");
const {
    createRequest,
    getRequests,
    approveRequest,
    resubmitRequest,
    getRequestById,
    auditProcurementRequest,
    financeApproveRequest,
    shipRequest,
    receiveRequest,
    addInventoryToStock
} = require("../Controller/WorkshopProcurementController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const upload = require("../../../utils/multerConfig.js");

const prPhotoUpload = upload.fields([
    { name: 'fullSizePhoto', maxCount: 1 },
    { name: 'closeUpPhoto', maxCount: 1 }
]);

router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.MERCHENDISE, ROLES.ADMIN, ROLES.OPERATIONSTAFF),
    prPhotoUpload,
    createRequest
);

router.get(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.MERCHENDISE, ROLES.ADMIN, ROLES.OPERATIONSTAFF),
    getRequests
);

router.get(
    "/:id",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.MERCHENDISE, ROLES.ADMIN, ROLES.OPERATIONSTAFF),
    getRequestById
);

router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.MERCHENDISE, ROLES.ADMIN, ROLES.COUNTRYMANAGER),
    approveRequest
);

router.put(
    "/:id/resubmit",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.ADMIN, ROLES.OPERATIONSTAFF),
    prPhotoUpload,
    resubmitRequest
);

router.put(
    "/:id/audit",
    authenticate,
    authorize(ROLES.MERCHENDISE, ROLES.ADMIN),
    auditProcurementRequest
);

router.put(
    "/:id/finance-approve",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    financeApproveRequest
);

router.put(
    "/:id/ship",
    authenticate,
    authorize(ROLES.MERCHENDISE, ROLES.ADMIN),
    shipRequest
);

router.put(
    "/:id/receive",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.ADMIN),
    receiveRequest
);

router.put(
    "/:id/add-inventory",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.ADMIN),
    addInventoryToStock
);

module.exports = router;

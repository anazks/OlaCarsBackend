const express = require("express");
const router = express.Router();

const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

const {
    createTaskTemplateHandler,
    getTaskTemplatesHandler,
    getTaskTemplateByIdHandler,
    getTaskTemplatesByTypeHandler,
    updateTaskTemplateHandler,
    deleteTaskTemplateHandler,
} = require("../Controller/TaskTemplateController");

// Create a task template
router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN),
    createTaskTemplateHandler
);

// List task templates (filter by branchId, workOrderType, search)
router.get(
    "/",
    authenticate,
    getTaskTemplatesHandler
);

// Get templates by work order type
router.get(
    "/by-type/:type",
    authenticate,
    getTaskTemplatesByTypeHandler
);

// Get a single task template by ID
router.get(
    "/:id",
    authenticate,
    getTaskTemplateByIdHandler
);

// Update a task template
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN),
    updateTaskTemplateHandler
);

// Soft-delete a task template
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN),
    deleteTaskTemplateHandler
);

module.exports = router;

const DriverService = require("../Service/DriverService");
const { processDriverProgress } = require("../Service/DriverWorkflowService");
const { getDriverByIdService, updateDriverService } = require("../Repo/DriverRepo");
const uploadToS3 = require("../../../utils/uploadToS3");

// ─── S3 field → DB path mapping ──────────────────────────────────────
// Maps upload field names to their dot-notation paths in the Driver schema.
const S3_FIELD_MAP = {
    photograph: "personalInfo.photograph",
    idFrontImage: "identityDocs.idFrontImage",
    idBackImage: "identityDocs.idBackImage",
    licenseFront: "drivingLicense.frontImage",
    licenseBack: "drivingLicense.backImage",
    backgroundCheckDocument: "backgroundCheck.document",
    addressProofDocument: "addressProof.document",
    medicalCertificate: "medicalFitness.certificate",
    consentForm: "creditCheck.consentForm",
    contractPDF: "contract.generatedS3Key",
    signedContract: "contract.signedS3Key",
    activationChecklistDocument: "activation.checklistDocument",
};

/**
 * Create a new Driver application.
 * @route POST /api/driver
 */
const addDriver = async (req, res) => {
    try {
        const driverData = { ...req.body };
        driverData.createdBy = req.user.id;
        driverData.creatorRole = req.user.role;

        const newDriver = await DriverService.create(driverData);
        return res.status(201).json({ success: true, data: newDriver });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * List all drivers with optional query filters.
 * Sensitive fields (bankDetails, creditReport) are hidden from non-finance roles.
 * @route GET /api/driver
 */
const getDrivers = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const isFinanceRole = ["FINANCESTAFF", "FINANCEADMIN", "ADMIN"].includes(req.user.role);
        
        const result = await DriverService.getAll(queryParams, { includeSensitive: isFinanceRole });
        
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single driver by ID.
 * @route GET /api/driver/:id
 */
const getDriverById = async (req, res) => {
    try {
        const isFinanceRole = ["FINANCESTAFF", "FINANCEADMIN", "ADMIN"].includes(req.user.role);
        
        // Ensure overdue rent is rolled over before fetching
        await DriverService.rolloverOverdueRent(req.params.id);
        
        const driver = await DriverService.getById(req.params.id, { includeSensitive: isFinanceRole });
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });
        return res.status(200).json({ success: true, data: driver });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update non-workflow driver fields (personal info, docs, etc.)
 * @route PUT /api/driver/:id
 */
const editDriver = async (req, res) => {
    try {
        const updatedDriver = await DriverService.update(req.params.id, req.body);
        if (!updatedDriver) return res.status(404).json({ success: false, message: "Driver not found" });
        return res.status(200).json({ success: true, data: updatedDriver });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Progress a driver through the onboarding workflow.
 * @route PUT /api/driver/:id/progress
 */
const progressDriverStatus = async (req, res) => {
    try {
        const driverId = req.params.id;
        const { targetStatus, updateData, notes } = req.body;
        const user = req.user;

        const payload = { ...updateData };
        if (notes) payload.notes = notes;

        const updatedDriver = await processDriverProgress(driverId, targetStatus, payload, user);
        return res.status(200).json({ success: true, data: updatedDriver });
    } catch (error) {
        // #2 — Use error.statusCode instead of error.cause
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Upload driver documents to AWS S3.
 * #3 — Automatically updates the driver record with S3 keys after upload.
 * @route POST /api/driver/:id/upload-documents
 */
const uploadDriverDocuments = async (req, res) => {
    try {
        const driverId = req.params.id;

        const driver = await getDriverByIdService(driverId, { includeSensitive: false });
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).json({ success: false, message: "No documents uploaded" });
        }

        const uploadedKeys = {};
        const dbUpdate = {};

        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;

            const file = fileArray[0];
            const key = `drivers/${driverId}/documents/${fieldName}_${Date.now()}_${file.originalname}`;
            const uploadedKey = await uploadToS3(file, key);
            uploadedKeys[fieldName] = uploadedKey;

            // #3 — Map S3 field to DB path and queue for update
            const dbPath = S3_FIELD_MAP[fieldName];
            if (dbPath) {
                dbUpdate[dbPath] = uploadedKey;
            }
        }

        // #3 — Auto-update driver record with S3 keys
        if (Object.keys(dbUpdate).length > 0) {
            // backgroundCheck needs status set to UPLOADED when document is uploaded
            if (dbUpdate["backgroundCheck.document"]) {
                dbUpdate["backgroundCheck.status"] = "UPLOADED";
            }
            await updateDriverService(driverId, dbUpdate);
        }

        return res.status(200).json({
            success: true,
            message: "Documents uploaded and driver record updated.",
            data: uploadedKeys,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Soft-delete a driver.
 * @route DELETE /api/driver/:id
 */
const deleteDriver = async (req, res) => {
    try {
        await DriverService.remove(req.params.id);
        return res.status(200).json({ success: true, message: "Driver deleted successfully" });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Record a partial or full rent payment for a driver's week.
 * @route PUT /api/driver/:id/rent/pay
 */
const markRentAsPaid = async (req, res) => {
    try {
        const { weekNumber, amount, paymentMethod, transactionId, note } = req.body;
        const driverId = req.params.id;

        if (!weekNumber || !amount) {
            return res.status(400).json({ success: false, message: "weekNumber and amount are required." });
        }

        const paymentPayload = {
            weekNumber, amount, paymentMethod, transactionId, note,
            createdBy: req.user.id,
            creatorRole: req.user.role
        };
        const updatedDriver = await DriverService.payRent(driverId, paymentPayload);
        return res.status(200).json({ success: true, data: updatedDriver });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Update performance metrics for a driver.
 * @route PUT /api/driver/:id/performance
 */
const updatePerformance = async (req, res) => {
    try {
        const driverId = req.params.id;
        const metrics = req.body;

        const updatedDriver = await DriverService.updateMetrics(driverId, metrics);
        return res.status(200).json({ success: true, data: updatedDriver });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    addDriver,
    getDrivers,
    getDriverById,
    editDriver,
    progressDriverStatus,
    uploadDriverDocuments,
    deleteDriver,
    markRentAsPaid,
    updatePerformance,
};

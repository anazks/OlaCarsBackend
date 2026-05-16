const DriverService = require("../Service/DriverService");
const { processDriverProgress } = require("../Service/DriverWorkflowService");
const { getDriverByIdService, updateDriverService } = require("../Repo/DriverRepo");
const uploadToS3 = require("../../../utils/uploadToS3");
const getPresignedUrl = require("../../../utils/getPresignedUrl");

// ─── S3 field → DB path mapping ──────────────────────────────────────
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
 * Helper to process all S3 URLs in a driver object and replace them with Presigned URLs.
 */
const processDriverS3Urls = async (driver) => {
    if (!driver) return null;
    const obj = typeof driver.toObject === 'function' ? driver.toObject() : driver;

    if (obj.personalInfo?.photograph) obj.personalInfo.photograph = await getPresignedUrl(obj.personalInfo.photograph);
    
    if (obj.identityDocs) {
        if (obj.identityDocs.idFrontImage) obj.identityDocs.idFrontImage = await getPresignedUrl(obj.identityDocs.idFrontImage);
        if (obj.identityDocs.idBackImage) obj.identityDocs.idBackImage = await getPresignedUrl(obj.identityDocs.idBackImage);
    }

    if (obj.drivingLicense) {
        if (obj.drivingLicense.frontImage) obj.drivingLicense.frontImage = await getPresignedUrl(obj.drivingLicense.frontImage);
        if (obj.drivingLicense.backImage) obj.drivingLicense.backImage = await getPresignedUrl(obj.drivingLicense.backImage);
    }

    if (obj.backgroundCheck?.document) obj.backgroundCheck.document = await getPresignedUrl(obj.backgroundCheck.document);
    if (obj.addressProof?.document) obj.addressProof.document = await getPresignedUrl(obj.addressProof.document);
    if (obj.medicalFitness?.certificate) obj.medicalFitness.certificate = await getPresignedUrl(obj.medicalFitness.certificate);
    if (obj.creditCheck?.consentForm) obj.creditCheck.consentForm = await getPresignedUrl(obj.creditCheck.consentForm);
    
    if (obj.contract) {
        if (obj.contract.generatedS3Key) obj.contract.generatedS3Key = await getPresignedUrl(obj.contract.generatedS3Key);
        if (obj.contract.signedS3Key) obj.contract.signedS3Key = await getPresignedUrl(obj.contract.signedS3Key);
    }

    if (obj.activation?.checklistDocument) obj.activation.checklistDocument = await getPresignedUrl(obj.activation.checklistDocument);

    return obj;
};

/**
 * Create a new Driver application.
 */
const addDriver = async (req, res) => {
    try {
        const driverData = { ...req.body, createdBy: req.user.id, creatorRole: req.user.role };
        const newDriver = await DriverService.create(driverData);
        const processed = await processDriverS3Urls(newDriver);
        return res.status(201).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

/**
 * List all drivers
 */
const getDrivers = async (req, res) => {
    try {
        const isFinanceRole = ["FINANCESTAFF", "FINANCEADMIN", "ADMIN"].includes(req.user.role);
        const result = await DriverService.getAll(req.query, { includeSensitive: isFinanceRole });
        
        const processedData = await Promise.all(result.data.map(d => processDriverS3Urls(d)));
        
        return res.status(200).json({ 
            success: true, 
            data: processedData,
            pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get single driver
 */
const getDriverById = async (req, res) => {
    try {
        const isFinanceRole = ["FINANCESTAFF", "FINANCEADMIN", "ADMIN"].includes(req.user.role);
        await DriverService.rolloverOverdueRent(req.params.id);
        const driver = await DriverService.getById(req.params.id, { includeSensitive: isFinanceRole });
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });
        
        const processed = await processDriverS3Urls(driver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get current driver's profile
 */
const getDriverMe = async (req, res) => {
    try {
        const driver = await DriverService.getByEmail(req.user.email, { includeSensitive: false });
        if (!driver) return res.status(404).json({ success: false, message: "Driver profile not found" });
        const processed = await processDriverS3Urls(driver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update driver fields
 */
const editDriver = async (req, res) => {
    try {
        const updatedDriver = await DriverService.update(req.params.id, req.body);
        if (!updatedDriver) return res.status(404).json({ success: false, message: "Driver not found" });
        const processed = await processDriverS3Urls(updatedDriver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

/**
 * Progress driver status
 */
const progressDriverStatus = async (req, res) => {
    try {
        const payload = { ...req.body.updateData };
        if (req.body.notes) payload.notes = req.body.notes;
        const updatedDriver = await processDriverProgress(req.params.id, req.body.targetStatus, payload, req.user);
        const processed = await processDriverS3Urls(updatedDriver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

/**
 * Upload driver documents
 */
const uploadDriverDocuments = async (req, res) => {
    try {
        const driverId = req.params.id;
        const driver = await getDriverByIdService(driverId, { includeSensitive: false });
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        const files = req.files;
        if (!files || Object.keys(files).length === 0) return res.status(400).json({ success: false, message: "No documents uploaded" });

        const uploadedUrls = {};
        const dbUpdate = {};

        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;
            const file = fileArray[0];
            const key = `drivers/${driverId}/documents/${fieldName}_${Date.now()}_${file.originalname}`;
            const url = await uploadToS3(file, key);
            uploadedUrls[fieldName] = url;

            const dbPath = S3_FIELD_MAP[fieldName];
            if (dbPath) dbUpdate[dbPath] = url;
        }

        if (Object.keys(dbUpdate).length > 0) {
            if (dbUpdate["backgroundCheck.document"]) dbUpdate["backgroundCheck.status"] = "UPLOADED";
            await updateDriverService(driverId, dbUpdate);
        }

        // Sign newly uploaded URLs
        const signedUrls = {};
        for (const [field, url] of Object.entries(uploadedUrls)) {
            signedUrls[field] = await getPresignedUrl(url);
        }

        return res.status(200).json({
            success: true,
            message: "Documents uploaded and verified.",
            data: signedUrls,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteDriver = async (req, res) => {
    try {
        await DriverService.remove(req.params.id);
        return res.status(200).json({ success: true, message: "Driver deleted successfully" });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

const markRentAsPaid = async (req, res) => {
    try {
        const { weekNumber, amount, paymentMethod, transactionId, note } = req.body;
        const paymentPayload = { weekNumber: Number(weekNumber), amount: Number(amount), paymentMethod, transactionId, note, createdBy: req.user.id, creatorRole: req.user.role };
        const updatedDriver = await DriverService.payRent(req.params.id, paymentPayload);
        const processed = await processDriverS3Urls(updatedDriver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

const updatePerformance = async (req, res) => {
    try {
        const updatedDriver = await DriverService.updateMetrics(req.params.id, req.body);
        const processed = await processDriverS3Urls(updatedDriver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

const bulkAddDrivers = async (req, res) => {
    try {
        const { drivers, branch: selectedBranch } = req.body;
        if (!Array.isArray(drivers) || drivers.length === 0) return res.status(400).json({ success: false, message: "Invalid drivers array." });

        const branch = ["OPERATIONSTAFF", "FINANCESTAFF", "BRANCHMANAGER"].includes(req.user.role) ? req.user.branchId : selectedBranch;
        if (!branch) return res.status(400).json({ success: false, message: "Branch selection required." });

        const results = { created: [], errors: [] };
        for (let i = 0; i < drivers.length; i++) {
            const row = drivers[i];
            try {
                const driverData = {
                    personalInfo: { fullName: row.fullName, email: row.email.toLowerCase(), phone: row.phone },
                    branch, createdBy: req.user.id, creatorRole: req.user.role
                };
                const newDriver = await DriverService.create(driverData);
                results.created.push({ id: newDriver._id, name: row.fullName });
            } catch (err) {
                results.errors.push({ row: i + 1, message: err.message });
            }
        }
        return res.status(results.created.length > 0 ? 201 : 400).json({ success: results.created.length > 0, data: results });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const dataMigrateDrivers = async (req, res) => {
    try {
        const { drivers, branch: selectedBranch, handlingStaff } = req.body;
        if (!Array.isArray(drivers) || drivers.length === 0) return res.status(400).json({ success: false, message: "Invalid drivers array." });

        const branch = ["OPERATIONSTAFF", "FINANCESTAFF", "BRANCHMANAGER"].includes(req.user.role) ? req.user.branchId : selectedBranch;
        if (!branch) return res.status(400).json({ success: false, message: "Branch selection required." });

        const { addVehicleService } = require("../../Vehicle/Repo/VehicleRepo");
        const results = { created: [], errors: [] };

        for (let i = 0; i < drivers.length; i++) {
            const row = drivers[i];
            try {
                const vehicle = await addVehicleService({
                    status: "ACTIVE — RENTED", handlingStaff, purchaseDetails: { branch },
                    basicDetails: { make: row.vehicleMake, model: row.vehicleModel, vin: row.vehicleVin },
                    legalDocs: { registrationNumber: row.vehicleNumber },
                    createdBy: req.user.id, creatorRole: req.user.role
                });

                const driver = await DriverService.create({
                    status: "ACTIVE", personalInfo: { fullName: row.fullName, email: row.email.toLowerCase(), phone: row.phone },
                    currentVehicle: vehicle._id, branch, createdBy: req.user.id, creatorRole: req.user.role
                });

                results.created.push({ driverId: driver.driverId, name: row.fullName });
            } catch (err) {
                results.errors.push({ row: i + 1, message: err.message });
            }
        }
        return res.status(results.created.length > 0 ? 201 : 400).json({ success: results.created.length > 0, data: results });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const payAdditionalPayment = async (req, res) => {
    try {
        const { amount, paymentMethod, note } = req.body;
        const driver = await DriverService.payAdditional(req.params.id, req.params.paymentId, { amount, paymentMethod, note, userId: req.user.id, userRole: req.user.role });
        const processed = await processDriverS3Urls(driver);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addDriver,
    getDrivers,
    getDriverById,
    getDriverMe,
    editDriver,
    progressDriverStatus,
    uploadDriverDocuments,
    deleteDriver,
    markRentAsPaid,
    updatePerformance,
    bulkAddDrivers,
    dataMigrateDrivers,
    payAdditionalPayment,
};

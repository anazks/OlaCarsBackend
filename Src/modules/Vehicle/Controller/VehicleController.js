const mongoose = require("mongoose");
const {
    addVehicleService,
    getVehiclesService,
    getVehicleByIdService,
    updateVehicleService,
} = require("../Repo/VehicleRepo");
const { updateDriverService, getDriverByIdService } = require("../../Driver/Repo/DriverRepo");
const { processVehicleProgress } = require("../Service/VehicleWorkflowService");
const uploadToS3 = require("../../../utils/uploadToS3");
const getPresignedUrl = require("../../../utils/getPresignedUrl");

/**
 * Helper to process all S3 URLs in a vehicle object and replace them with Presigned URLs.
 */
const processVehicleS3Urls = async (vehicle) => {
    if (!vehicle) return null;
    const obj = typeof vehicle.toObject === 'function' ? vehicle.toObject() : vehicle;

    // Inspection Photos (Arrays)
    if (obj.inspection?.exteriorPhotos) {
        obj.inspection.exteriorPhotos = await Promise.all(obj.inspection.exteriorPhotos.map(url => getPresignedUrl(url)));
    }
    if (obj.inspection?.interiorPhotos) {
        obj.inspection.interiorPhotos = await Promise.all(obj.inspection.interiorPhotos.map(url => getPresignedUrl(url)));
    }
    if (obj.inspection?.odometerPhoto) {
        obj.inspection.odometerPhoto = await getPresignedUrl(obj.inspection.odometerPhoto);
    }

    // Legal Documents
    if (obj.legalDocs) {
        const docFields = ['registrationCertificate', 'roadTaxDisc', 'roadworthinessCertificate', 'numberPlateFront', 'numberPlateRear', 'transferOfOwnership'];
        for (const field of docFields) {
            if (obj.legalDocs[field]) obj.legalDocs[field] = await getPresignedUrl(obj.legalDocs[field]);
        }
    }

    // Insurance & Purchase
    if (obj.insuranceDetails?.certificate) {
        obj.insuranceDetails.certificate = await getPresignedUrl(obj.insuranceDetails.certificate);
    }
    if (obj.purchaseDetails?.purchaseReceipt) {
        obj.purchaseDetails.purchaseReceipt = await getPresignedUrl(obj.purchaseDetails.purchaseReceipt);
    }

    return obj;
};

/**
 * Create a new Vehicle Outline. (Step 1 & 2)
 */
const addVehicle = async (req, res, next) => {
    try {
        let vehicleData = req.body;
        vehicleData.createdBy = req.user.id;
        vehicleData.creatorRole = req.user.role;
        vehicleData.status = "PENDING ENTRY";
        
        if (vehicleData.handlingStaff) {
            const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
            const { generateNextFleetNumber } = require("../../FinanceStaff/Service/FinanceStaffService");
            const staff = await FinanceStaff.findById(vehicleData.handlingStaff);
            if (staff) {
                let fleetToAssign = vehicleData.basicDetails?.fleetNumber || staff.fleetNumbers[0] || await generateNextFleetNumber();
                fleetToAssign = fleetToAssign.toString().trim();

                const otherStaff = await FinanceStaff.findOne({ fleetNumbers: fleetToAssign, _id: { $ne: staff._id }, isDeleted: false });
                if (otherStaff) return res.status(409).json({ success: false, message: `Fleet ${fleetToAssign} is already assigned.` });

                if (!staff.fleetNumbers.includes(fleetToAssign)) {
                    staff.fleetNumbers.push(fleetToAssign);
                    await staff.save();
                }
                if (!vehicleData.basicDetails) vehicleData.basicDetails = {};
                vehicleData.basicDetails.fleetNumber = fleetToAssign;
            }
        }

        const newVehicle = await addVehicleService(vehicleData);
        const populatedVehicle = await getVehicleByIdService(newVehicle._id);
        const processedVehicle = await processVehicleS3Urls(populatedVehicle);

        return res.status(201).json({ success: true, data: processedVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Vehicles
 */
const getVehicles = async (req, res, next) => {
    try {
        const queryParams = { ...req.query };
        if (queryParams.branch) {
            queryParams['purchaseDetails.branch'] = queryParams.branch;
            delete queryParams.branch;
        }

        const result = await getVehiclesService(queryParams, {
            baseQuery: { isDeleted: false },
            defaultSort: { createdAt: -1 }
        });
        
        const processedData = await Promise.all(result.data.map(v => processVehicleS3Urls(v)));

        return res.status(200).json({ 
            success: true, 
            data: processedData,
            pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages }
        });
    } catch (error) {
        console.error('[DEBUG GET VEHICLES ERROR]', error);
        return res.status(500).json({ success: false, message: error.message, stack: error.stack });
    }
};

/**
 * Get a single Vehicle
 */
const getVehicleById = async (req, res, next) => {
    try {
        const vehicle = await getVehicleByIdService(req.params.id);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
        
        const processedVehicle = await processVehicleS3Urls(vehicle);
        return res.status(200).json({ success: true, data: processedVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update Vehicle details and progress status
 */
const progressVehicleStatus = async (req, res, next) => {
    try {
        const updatedVehicle = await processVehicleProgress(req.params.id, req.body.targetStatus, req.body.updateData || {}, req.user);
        const processedVehicle = await processVehicleS3Urls(updatedVehicle);
        return res.status(200).json({ success: true, data: processedVehicle });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

/**
 * Upload Vehicle Documents and Photos to AWS S3.
 */
const uploadVehicleDocuments = async (req, res, next) => {
    try {
        const vehicleId = req.params.id;
        const vehicle = await getVehicleByIdService(vehicleId);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

        const files = req.files;
        if (!files || Object.keys(files).length === 0) return res.status(400).json({ success: false, message: "No documents uploaded" });

        const S3_FIELD_MAP = {
            exteriorPhotos: "inspection.exteriorPhotos",
            interiorPhotos: "inspection.interiorPhotos",
            odometerPhoto: "inspection.odometerPhoto",
            registrationCertificate: "legalDocs.registrationCertificate",
            roadTaxDisc: "legalDocs.roadTaxDisc",
            roadworthinessCertificate: "legalDocs.roadworthinessCertificate",
            numberPlateFront: "legalDocs.numberPlateFront",
            numberPlateRear: "legalDocs.numberPlateRear",
            transferOfOwnership: "legalDocs.transferOfOwnership",
            policyDocument: "insuranceDetails.certificate",
            purchaseReceipt: "purchaseDetails.purchaseReceipt"
        };

        const uploadedUrls = {};
        const dbUpdatePayload = {};

        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;
            const dbPath = S3_FIELD_MAP[fieldName];

            if (fieldName === "exteriorPhotos" || fieldName === "interiorPhotos") {
                uploadedUrls[fieldName] = [];
                for (const file of fileArray) {
                    const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                    const url = await uploadToS3(file, key);
                    uploadedUrls[fieldName].push(url);
                }
                if (dbPath) {
                    dbUpdatePayload.$push = dbUpdatePayload.$push || {};
                    dbUpdatePayload.$push[dbPath] = { $each: uploadedUrls[fieldName] };
                }
            } else {
                const file = fileArray[0];
                const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                const url = await uploadToS3(file, key);
                uploadedUrls[fieldName] = url;
                if (dbPath) dbUpdatePayload[dbPath] = url;
            }
        }

        if (Object.keys(dbUpdatePayload).length > 0) {
            await updateVehicleService(vehicleId, dbUpdatePayload);
        }

        // Return signed URLs for the newly uploaded files
        const signedUrls = {};
        for (const [field, val] of Object.entries(uploadedUrls)) {
            if (Array.isArray(val)) {
                signedUrls[field] = await Promise.all(val.map(u => getPresignedUrl(u)));
            } else {
                signedUrls[field] = await getPresignedUrl(val);
            }
        }

        return res.status(200).json({ success: true, data: signedUrls });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get available vehicles
 */
const getAvailableCars = async (req, res, next) => {
    try {
        const queryParams = { ...req.query };
        const branchRoles = ["BRANCHMANAGER", "OPERATIONSTAFF", "FINANCESTAFF", "WORKSHOPSTAFF"];
        const baseQuery = { status: "ACTIVE — AVAILABLE", isDeleted: false };

        if (branchRoles.includes(req.user.role) && req.user.branchId) {
            baseQuery["purchaseDetails.branch"] = req.user.branchId;
        }

        const result = await getVehiclesService(queryParams, { baseQuery, defaultSort: { createdAt: -1 } });
        const processedData = await Promise.all(result.data.map(v => processVehicleS3Urls(v)));
        
        return res.status(200).json({ 
            success: true, 
            data: processedData,
            pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const assignCarToDriver = async (req, res, next) => {
    let session = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const { durationMonths, monthlyRent, depositAmount = 0 } = req.body;

        const vehicle = await getVehicleByIdService(req.params.id);
        if (!vehicle || vehicle.status !== "ACTIVE — AVAILABLE") throw new Error("Vehicle unavailable");

        const driver = await getDriverByIdService(req.params.driverId);
        if (!driver) throw new Error("Driver not found");

        const { createLeaseService } = require("../../Lease/Service/LeaseService");
        await createLeaseService({
            driver: req.params.driverId,
            vehicle: req.params.id,
            durationWeeks: durationMonths * 4,
            weeklyRent: Math.ceil(monthlyRent / 4),
            agreementVersion: req.body.agreementVersion
        }, req.user.id, req.user.role, session);

        await updateVehicleService(req.params.id, { status: "ACTIVE — RENTED" }, session);
        await updateDriverService(req.params.driverId, { currentVehicle: req.params.id }, session);

        await session.commitTransaction();
        return res.status(200).json({ success: true, message: "Vehicle assigned." });
    } catch (error) {
        if (session) await session.abortTransaction();
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        if (session) session.endSession();
    }
};

const updateVehicleLeaseSettings = async (req, res) => {
    try {
        const updated = await updateVehicleService(req.params.id, { "basicDetails.leaseDurationWeeks": req.body.durationWeeks, "basicDetails.weeklyRent": req.body.weeklyRent });
        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateMaintenanceSettings = async (req, res) => {
    try {
        const updated = await updateVehicleService(req.params.id, { "maintenanceDetails.maintenanceThresholdKm": req.body.maintenanceThresholdKm });
        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateVehicle = async (req, res) => {
    try {
        const updated = await updateVehicleService(req.params.id, req.body);
        const processed = await processVehicleS3Urls(updated);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addVehicle,
    getVehicles,
    getVehicleById,
    progressVehicleStatus,
    uploadVehicleDocuments,
    getAvailableCars,
    assignCarToDriver,
    updateVehicleLeaseSettings,
    updateMaintenanceSettings,
    updateVehicle
};

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

/**
 * Create a new Vehicle Outline. (Step 1 & 2)
 * @route POST /api/vehicle/
 * @access Private
 */
const addVehicle = async (req, res, next) => {
    console.log('[DEBUG] addVehicle - Controller Started');
    try {
        let vehicleData = req.body;
        vehicleData.createdBy = req.user.id;
        vehicleData.creatorRole = req.user.role;
        vehicleData.status = "PENDING ENTRY";

        // Handle Handling Staff and Fleet Number logic
        if (vehicleData.handlingStaff) {
            console.log('[DEBUG] addVehicle - Fetching staff with ID:', vehicleData.handlingStaff);
            const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
            const { generateNextFleetNumber } = require("../../FinanceStaff/Service/FinanceStaffService");

            const staff = await FinanceStaff.findById(vehicleData.handlingStaff);
            console.log('[DEBUG] addVehicle - Staff lookup result:', staff ? `Found ${staff.fullName}` : 'NOT FOUND');
            if (staff) {
                let fleetToAssign = vehicleData.basicDetails?.fleetNumber;
                console.log('[DEBUG] addVehicle - Incoming fleetNumber:', fleetToAssign);

                if (!fleetToAssign) {
                    fleetToAssign = (staff.fleetNumbers && staff.fleetNumbers.length > 0) ? staff.fleetNumbers[0] : await generateNextFleetNumber();
                    console.log('[DEBUG] addVehicle - Using generated/default fleet:', fleetToAssign);
                }

                fleetToAssign = fleetToAssign.toString().trim();

                // Check if fleet is already assigned to another staff
                const otherStaff = await FinanceStaff.findOne({
                    fleetNumbers: fleetToAssign,
                    _id: { $ne: staff._id },
                    isDeleted: false
                });
                if (otherStaff) {
                    return res.status(409).json({
                        success: false,
                        message: `Duplicate Key Found: Fleet ${fleetToAssign} is already assigned to ${otherStaff.fullName}.`,
                        errorType: 'DUPLICATE_FLEET'
                    });
                }

                if (!staff.fleetNumbers.includes(fleetToAssign)) {
                    console.log('[DEBUG] addVehicle - Updating staff fleetNumbers with:', fleetToAssign);
                    staff.fleetNumbers.push(fleetToAssign);
                    await staff.save();
                    console.log('[DEBUG] addVehicle - Staff updated successfully');
                }

                if (!vehicleData.basicDetails) vehicleData.basicDetails = {};
                vehicleData.basicDetails.fleetNumber = fleetToAssign;
                console.log('[DEBUG] addVehicle - Set basicDetails.fleetNumber to:', vehicleData.basicDetails.fleetNumber);
            }
        }

        // Handle the new insurance flow
        if (req.body.insuranceId) {
            vehicleData.insurance = req.body.insuranceId;
        }

        const branchRoles = [
            "BRANCHMANAGER",
            "OPERATIONSTAFF",
            "FINANCESTAFF",
            "WORKSHOPSTAFF"
        ];

        // If created by branch manager or roles under him, branch ID comes from token
        if (branchRoles.includes(req.user.role) && req.user.branchId) {
            if (!vehicleData.purchaseDetails) {
                vehicleData.purchaseDetails = {};
            }
            vehicleData.purchaseDetails.branch = req.user.branchId;
        }

        console.log('[DEBUG] addVehicle - Final Vehicle Data before create:', JSON.stringify(vehicleData, null, 2));
        const newVehicle = await addVehicleService(vehicleData);

        // If a Purchase Order is linked, mark it as used
        if (newVehicle.purchaseDetails && newVehicle.purchaseDetails.purchaseOrder) {
            const { updatePurchaseOrderService } = require("../../PurchaseOrder/Repo/PurchaseOrderRepo");
            await updatePurchaseOrderService(newVehicle.purchaseDetails.purchaseOrder, { isUsed: true });
        }

        // If insurance is provided, add this vehicle to the insurance policy
        if (req.body.insuranceId) {
            const { updateInsuranceService } = require("../../Insurance/Repo/InsuranceRepo");
            await updateInsuranceService(req.body.insuranceId, {
                $push: { vehicles: newVehicle._id }
            });
        }

        // Return populated vehicle
        const populatedVehicle = await getVehicleByIdService(newVehicle._id);
        return res.status(201).json({ success: true, data: populatedVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Vehiclesf
 * @route GET /api/vehicle/
 * @access Private
 */
const getVehicles = async (req, res, next) => {
    try {
        const queryParams = { ...req.query };

        // Map universal 'branch' filter to the specific field in Vehicle schema
        if (queryParams.branch) {
            queryParams['purchaseDetails.branch'] = queryParams.branch;
            delete queryParams.branch;
        }

        const result = await getVehiclesService(queryParams, {
            baseQuery: { isDeleted: false },
            defaultSort: { createdAt: -1 }
        });

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
        console.error('[DEBUG GET VEHICLES ERROR]', error);
        return res.status(500).json({ success: false, message: error.message, stack: error.stack });
    }
};

/**
 * Get a single Vehicle
 * @route GET /api/vehicle/:id
 * @access Private
 */
const getVehicleById = async (req, res, next) => {
    try {
        const vehicle = await getVehicleByIdService(req.params.id);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
        return res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update Vehicle details and progress status through the Onboarding workflow.
 * @route PUT /api/vehicle/:id/progress
 * @access Private
 */
const progressVehicleStatus = async (req, res, next) => {
    try {
        const vehicleId = req.params.id;
        const { targetStatus, updateData, notes } = req.body;
        const user = req.user;

        // Merge top-level notes into updateData
        const payload = { ...updateData };
        if (notes) payload.notes = notes;

        const updatedVehicle = await processVehicleProgress(vehicleId, targetStatus, payload, user);

        return res.status(200).json({ success: true, data: updatedVehicle });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Upload Vehicle Documents and Photos to AWS S3.
 * Automatically updates the Vehicle database record with the new S3 keys.
 * Accepts multiple document fields in formData.
 * @route POST /api/vehicle/:id/upload-documents
 * @access Private
 */
const uploadVehicleDocuments = async (req, res, next) => {
    try {
        console.log("req.files", req.files);
        console.log("req.body", req.body);
        const vehicleId = req.params.id;

        // Ensure vehicle exists
        const vehicle = await getVehicleByIdService(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).json({ success: false, message: "No documents uploaded" });
        }

        // Mapping frontend field names to DB dot-notation paths
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
            insuranceCertificate: "insuranceDetails.certificate",
            purchaseReceipt: "purchaseDetails.purchaseReceipt"
        };

        const uploadedKeys = {};
        const dbUpdatePayload = {};

        // Loop through all file fields gracefully
        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;

            const dbPath = S3_FIELD_MAP[fieldName];

            if (fieldName === "exteriorPhotos" || fieldName === "interiorPhotos") {
                uploadedKeys[fieldName] = [];
                for (const file of fileArray) {
                    const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                    const uploadedKey = await uploadToS3(file, key);
                    uploadedKeys[fieldName].push(uploadedKey);
                }
                if (dbPath) {
                    // Use $push specifically for arrays to append new photos
                    dbUpdatePayload.$push = dbUpdatePayload.$push || {};
                    dbUpdatePayload.$push[dbPath] = { $each: uploadedKeys[fieldName] };
                }
            } else {
                // For all single file uploads
                const file = fileArray[0];
                const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                const uploadedKey = await uploadToS3(file, key);
                uploadedKeys[fieldName] = uploadedKey;

                if (dbPath) {
                    dbUpdatePayload[dbPath] = uploadedKey;
                }
            }
        }

        // Auto-update DB if mapping exists
        if (Object.keys(dbUpdatePayload).length > 0) {
            const { updateVehicleService } = require("../Repo/VehicleRepo");
            await updateVehicleService(vehicleId, dbUpdatePayload);
        }

        return res.status(200).json({
            success: true,
            message: "Documents uploaded and vehicle record mapped successfully.",
            data: uploadedKeys
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
/**
 * Get available vehicles for the staff's branch.
 * @route GET /api/vehicle/available
 * @access Private
 */
const getAvailableCars = async (req, res, next) => {
    try {
        const queryParams = { ...req.query };
        const branchRoles = [
            "BRANCHMANAGER",
            "OPERATIONSTAFF",
            "FINANCESTAFF",
            "WORKSHOPSTAFF"
        ];

        // Filter by status and branch
        const baseQuery = {
            status: "ACTIVE — AVAILABLE",
            isDeleted: false
        };

        if (branchRoles.includes(req.user.role) && req.user.branchId) {
            baseQuery["purchaseDetails.branch"] = req.user.branchId;
        }

        console.log('[DEBUG] getAvailableCars - baseQuery:', JSON.stringify(baseQuery, null, 2));

        const result = await getVehiclesService(queryParams, {
            baseQuery,
            defaultSort: { createdAt: -1 }
        });

        console.log('[DEBUG] getAvailableCars - Found vehicles:', result.data?.length || 0);
        if (result.data && result.data.length > 0) {
            console.log('[DEBUG] getAvailableCars - First Vehicle Status:', result.data[0].status);
            console.log('[DEBUG] getAvailableCars - First Vehicle Branch:', result.data[0].purchaseDetails?.branch?._id || result.data[0].purchaseDetails?.branch);
        }

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
 * Assign a vehicle to a driver and record the lease.
 * @route POST /api/vehicle/:id/assign/:driverId
 * @body { leaseDuration: number, monthlyRent: number, notes: string }
 * @access Private
 */
const assignCarToDriver = async (req, res, next) => {
    let session = null;

    try {
        session = await mongoose.startSession();
        session.startTransaction();
        console.log('[DEBUG] Starting Vehicle Assignment Transaction...');

        const vehicleId = req.params.id;
        const driverId = req.params.driverId;
        const {
            durationMonths,
            monthlyRent,
            depositAmount = 0,
            notes,
            agreementVersion,
            generatedS3Key,
            signedS3Key
        } = req.body;

        if (durationMonths === undefined || monthlyRent === undefined) {
            throw new Error("durationMonths and monthlyRent are required during assignment.");
        }

        // 1. Verify vehicle exists and is available
        const vehicle = await getVehicleByIdService(vehicleId);
        if (!vehicle) {
            res.status(404);
            throw new Error("Vehicle not found");
        }
        if (vehicle.status !== "ACTIVE — AVAILABLE") {
            res.status(400);
            throw new Error(`Vehicle is not available for lease. Current status: ${vehicle.status}`);
        }

        // 2. Verify driver exists
        const driver = await getDriverByIdService(driverId);
        if (!driver) {
            res.status(404);
            throw new Error("Driver not found");
        }

        // 3. Validate rent calculation on backend
        const purchasePrice = vehicle.purchaseDetails?.purchasePrice || 0;
        const effectiveCost = Math.max(0, purchasePrice - depositAmount);
        const expectedRent = durationMonths > 0 ? Math.ceil(effectiveCost / durationMonths) : 0;
        console.log(`[DEBUG] Assignment Calc: Price=${purchasePrice}, Deposit=${depositAmount}, Effective=${effectiveCost}, Duration=${durationMonths}mo, Rent=${expectedRent}/mo (frontend sent ${monthlyRent})`);

        // 4. Create Lease record
        const { createLeaseService } = require("../../Lease/Service/LeaseService");
        const lease = await createLeaseService({
            driver: driverId,
            vehicle: vehicleId,
            durationWeeks: durationMonths * 4, // approximate for lease record compat
            weeklyRent: Math.ceil(monthlyRent / 4), // approximate for lease record compat
            notes: `Monthly: ${durationMonths}mo @ $${monthlyRent}/mo. Deposit: $${depositAmount}`,
            agreementVersion,
            generatedS3Key,
            signedS3Key
        }, req.user.id, req.user.role, session);

        // 5. Update Vehicle status
        await updateVehicleService(vehicleId, {
            status: "ACTIVE — RENTED",
            currentDriver: driverId,
            $push: {
                statusHistory: {
                    status: "ACTIVE — RENTED",
                    changedBy: req.user.id,
                    changedByRole: req.user.role,
                    notes: `Assigned to driver ${driver.personalInfo.fullName} (${driverId}). Lease: ${durationMonths} months @ $${monthlyRent}/mo. Deposit: $${depositAmount}.`
                }
            }
        }, session);

        // 6. Update Driver — link vehicle + add deposit if applicable
        const driverUpdate = {
            currentVehicle: vehicleId,
            $push: {
                statusHistory: {
                    status: driver.status,
                    changedBy: req.user.id,
                    changedByRole: req.user.role,
                    notes: `Assigned vehicle ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle.basicDetails.vin}). Lease: ${durationMonths} months.`
                }
            }
        };

        await updateDriverService(driverId, driverUpdate, session);

        // 7. If deposit exists, add it as an additional payment and create a separate invoice for it
        if (depositAmount > 0) {
            const { Invoice } = require("../../Invoice/Model/InvoiceModel");
            const invoiceDueDate = new Date();
            invoiceDueDate.setDate(invoiceDueDate.getDate() + 14); // 2 weeks from now

            const ts = Date.now();
            const invoiceNumber = `DEP-${ts}`;

            const depositInvoice = await Invoice.create([{
                invoiceNumber,
                invoiceType: "DEPOSIT",
                driver: driverId,
                vehicle: vehicleId,
                dueDate: invoiceDueDate,
                baseAmount: depositAmount,
                carryOverAmount: 0,
                totalAmountDue: depositAmount,
                amountPaid: 0,
                balance: depositAmount,
                status: "PENDING",
                payments: [],
                lineItems: [{
                    name: `Down Payment / Deposit — ${vehicle.basicDetails.make} ${vehicle.basicDetails.model}`,
                    description: `Security deposit for vehicle assignment`,
                    qty: 1,
                    unitPrice: depositAmount,
                    total: depositAmount
                }],
                subtotal: depositAmount,
                createdBy: req.user.id,
                creatorRole: req.user.role,
                notes: notes || "Deposit for vehicle assignment"
            }], { session });

            // Since Invoice.create with a session returns an array of documents
            const createdInvoice = depositInvoice[0];

            await updateDriverService(driverId, {
                $push: {
                    additionalPayments: {
                        type: "DEPOSIT",
                        label: `Vehicle Deposit — ${vehicle.basicDetails.make} ${vehicle.basicDetails.model}`,
                        amount: depositAmount,
                        dueDate: invoiceDueDate,
                        status: "PENDING",
                        amountPaid: 0,
                        balance: depositAmount,
                        relatedVehicle: vehicleId,
                        invoiceRef: createdInvoice._id,
                        invoiceNumber: invoiceNumber,
                        notes: notes || "Deposit for vehicle assignment",
                    }
                }
            }, session);
        }

        // 8. Generate the monthly/weekly rent plan
        const DriverService = require("../../Driver/Service/DriverService");
        await DriverService.generateRentPlan(driverId, {
            monthlyRent: monthlyRent,
            weeklyRent: req.body.weeklyRent,
            durationMonths: durationMonths,
            durationWeeks: req.body.durationWeeks,
            frequency: req.body.frequency || 'MONTHLY'
        }, session);

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Vehicle successfully assigned to driver and lease record created."
        });
    } catch (error) {
        console.error('[ERROR] assignCarToDriver Exception:', error);
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message,
            stack: error.stack
        });
    }
};

/**
 * Update Vehicle Lease Settings (Financial Admin only)
 * @route PUT /api/vehicle/:id/lease-settings
 * @body { durationWeeks: number, weeklyRent: number }
 * @access Private
 */
const updateVehicleLeaseSettings = async (req, res, next) => {
    try {
        console.log('[DEBUG] updateVehicleLeaseSettings - Body:', JSON.stringify(req.body, null, 2));
        const vehicleId = req.params.id;
        const { durationWeeks, weeklyRent, sellingValue } = req.body;

        if (typeof durationWeeks !== 'number') {
            return res.status(400).json({ success: false, message: "Invalid or missing durationWeeks field." });
        }

        const updateData = {
            "basicDetails.leaseDurationWeeks": durationWeeks
        };

        if (typeof weeklyRent === 'number') {
            updateData["basicDetails.weeklyRent"] = weeklyRent;
        }

        if (typeof sellingValue === 'number') {
            updateData["basicDetails.sellingValue"] = sellingValue;
        }

        const { updateVehicleService } = require("../Repo/VehicleRepo");
        const updatedVehicle = await updateVehicleService(vehicleId, updateData);

        if (!updatedVehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        return res.status(200).json({ success: true, data: updatedVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update Vehicle Maintenance Settings (Admin/Manager only)
 * @route PUT /api/vehicle/:id/maintenance-settings
 * @body { maintenanceThresholdKm: number }
 * @access Private
 */
const updateMaintenanceSettings = async (req, res, next) => {
    try {
        const vehicleId = req.params.id;
        const { maintenanceThresholdKm } = req.body;

        if (typeof maintenanceThresholdKm !== 'number') {
            return res.status(400).json({ success: false, message: "Invalid or missing maintenanceThresholdKm field." });
        }

        const { updateVehicleService } = require("../Repo/VehicleRepo");
        const updatedVehicle = await updateVehicleService(vehicleId, {
            "maintenanceDetails.maintenanceThresholdKm": maintenanceThresholdKm
        });

        if (!updatedVehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        return res.status(200).json({ success: true, data: updatedVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update any generic fields on a Vehicle record.
 * @route PUT /api/vehicle/:id
 * @access Private
 */
const updateVehicle = async (req, res, next) => {
    try {
        const vehicleId = req.params.id;
        const updateData = req.body;

        const { updateVehicleService } = require("../Repo/VehicleRepo");
        const updatedVehicle = await updateVehicleService(vehicleId, updateData);

        if (!updatedVehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        return res.status(200).json({ success: true, data: updatedVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get vehicles due for (or approaching) service based on maintenance threshold.
 * @route GET /api/vehicle/due-for-service
 * @access Private (Workshop/Admin)
 */
const getVehiclesDueForService = async (req, res, next) => {
    try {
        const { Vehicle } = require("../Model/VehicleModel");
        const warningPercent = parseFloat(req.query.warningPercent) || 0.8; // default 80%

        const baseQuery = {
            isDeleted: false,
            status: { $in: ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "ACTIVE — MAINTENANCE"] },
        };

        // Branch-scope for branch-level roles
        const branchRoles = ["BRANCHMANAGER", "OPERATIONSTAFF", "FINANCESTAFF", "WORKSHOPSTAFF", "WORKSHOPMANAGER"];
        if (branchRoles.includes(req.user.role) && req.user.branchId) {
            baseQuery["purchaseDetails.branch"] = req.user.branchId;
        }

        const vehicles = await Vehicle.find(baseQuery)
            .populate("purchaseDetails.branch", "name country")
            .populate("currentDriver", "personalInfo.fullName personalInfo.phone driverId")
            .sort({ "basicDetails.odometer": -1 })
            .lean();

        // Query active maintenance alerts to check if vehicle has been pulled already
        const { Alert } = require("../../Alert/Model/AlertModel");
        const activeAlerts = await Alert.find({
            vehicleId: { $in: vehicles.map(v => v._id) },
            type: "MAINTENANCE",
            status: "ACTIVE",
            isDeleted: false
        }).lean();

        const alertMap = {};
        activeAlerts.forEach(a => {
            alertMap[a.vehicleId.toString()] = a;
        });

        // Compute maintenance status for each vehicle
        const result = vehicles.map(v => {
            const odometer = v.basicDetails?.odometer || 0;
            const threshold = v.maintenanceDetails?.maintenanceThresholdKm || 1000;
            const lastServiceOdo = v.maintenanceDetails?.lastMaintenanceOdometer || 0;
            const distanceSinceService = Math.max(0, odometer - lastServiceOdo);
            const percentUsed = threshold > 0 ? (distanceSinceService / threshold) : 0;

            let serviceStatus = 'OK';
            if (percentUsed >= 1) serviceStatus = 'OVERDUE';
            else if (percentUsed >= warningPercent) serviceStatus = 'APPROACHING';

            const activeAlert = alertMap[v._id.toString()];
            const isPulled = !!(activeAlert && activeAlert.metadata?.source === 'WORKSHOP_PULL');
            const activeAlertId = activeAlert ? activeAlert._id : null;

            return {
                _id: v._id,
                basicDetails: v.basicDetails,
                purchaseDetails: v.purchaseDetails,
                status: v.status,
                currentDriver: v.currentDriver,
                maintenanceDetails: v.maintenanceDetails,
                // Computed fields
                distanceSinceService,
                threshold,
                lastServiceOdometer: lastServiceOdo,
                percentUsed: Math.round(percentUsed * 100),
                serviceStatus,
                isPulled,
                activeAlertId,
            };
        });

        // Filter: only include vehicles that are APPROACHING or OVERDUE (or all if requested)
        const showAll = req.query.showAll === 'true';
        let filtered = showAll ? result : result.filter(v => v.percentUsed >= (warningPercent * 100));

        // Category Filter
        const activeFilter = req.query.filter || 'ALL';
        if (activeFilter === 'DUE') {
            filtered = filtered.filter(v => v.serviceStatus === 'OVERDUE');
        } else if (activeFilter === 'APPROACHING') {
            filtered = filtered.filter(v => v.serviceStatus === 'APPROACHING');
        } else if (activeFilter === 'OK') {
            filtered = filtered.filter(v => v.serviceStatus === 'OK');
        }

        // Search Filter
        const search = (req.query.search || "").trim().toLowerCase();
        if (search) {
            filtered = filtered.filter(v => {
                const make = (v.basicDetails?.make || '').toLowerCase();
                const model = (v.basicDetails?.model || '').toLowerCase();
                const vin = (v.basicDetails?.vin || '').toLowerCase();
                const reg = (v.basicDetails?.registrationNumber || '').toLowerCase();
                return make.includes(search) || model.includes(search) || vin.includes(search) || reg.includes(search);
            });
        }

        // Calculate counts based on entire fleet due-for-service status
        const counts = {
            all: result.length,
            due: result.filter(v => v.serviceStatus === 'OVERDUE').length,
            approaching: result.filter(v => v.serviceStatus === 'APPROACHING').length,
            ok: result.filter(v => v.serviceStatus === 'OK').length
        };

        // Pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 15);
        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const paginated = filtered.slice(startIndex, startIndex + limit);

        return res.status(200).json({
            success: true,
            data: paginated,
            pagination: { total, page, limit, totalPages },
            counts
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const mapExcelStatus = (excelStatus) => {
    if (!excelStatus) return "PENDING ENTRY";
    const statusStr = excelStatus.toString().trim().toUpperCase();

    // Check if it's already a valid DB status (with dash-normalized check)
    const { VEHICLE_STATUSES } = require("../Model/VehicleModel");
    const matchedValidStatus = VEHICLE_STATUSES.find(s => {
        const dbStatusNorm = s.replace(/\s*[—–-]\s*/g, '-').toUpperCase();
        const inputStatusNorm = statusStr.replace(/\s*[—–-]\s*/g, '-').toUpperCase();
        return dbStatusNorm === inputStatusNorm;
    });
    if (matchedValidStatus) {
        return matchedValidStatus;
    }

    if (statusStr === "ACTIVE VEHICLES") {
        return "ACTIVE — RENTED";
    }
    if (statusStr === "AGENCY / INSURANCE") {
        return "INSURANCE VERIFICATION";
    }
    if (statusStr === "CARS READY TO SALE-NEW") {
        return "RETIRED";
    }
    if (statusStr === "CARS READY TO SALE-USED") {
        return "ACTIVE — AVAILABLE";
    }
    if (statusStr === "NON ACTIVE CARS - DOCUMENTS ISSUE" || statusStr === "NON ACTIVE CARS-DOCUMENTS ISSUE" || statusStr === "NON ACTIVE CARS - DOCUMENT ISSUE") {
        return "DOCUMENTS REVIEW";
    }
    if (statusStr === "NON ACTIVE CARS - IN REPAIR" || statusStr === "NON ACTIVE CARS-IN REPAIR") {
        return "REPAIR IN PROGRESS";
    }
    if (statusStr === "TOTAL LOSS") {
        return "RETIRED";
    }
    if (statusStr === "W. GROUP" || statusStr === "W GROUP" || statusStr === "W.GROUP" || statusStr === "WGROUP") {
        return "W. GROUP ACTIVE";
    }

    return "PENDING ENTRY";
};

/**
 * Bulk-create vehicles from a parsed payload.
 * @route POST /api/vehicle/bulk
 */
const bulkAddVehicles = async (req, res) => {
    try {
        const { vehicles, branch: selectedBranch } = req.body;

        if (!Array.isArray(vehicles) || vehicles.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'vehicles' array." });
        }

        if (vehicles.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 vehicles per bulk upload." });
        }

        const userRole = req.user.role;
        const userId = req.user.id;
        const userBranchId = req.user.branchId;

        const branchRoles = [
            "BRANCHMANAGER",
            "OPERATIONSTAFF",
            "FINANCESTAFF",
            "WORKSHOPSTAFF"
        ];
        const isAutoAssign = branchRoles.includes(userRole);

        let branch;
        if (isAutoAssign) {
            branch = userBranchId;
            if (!branch) {
                return res.status(400).json({ success: false, message: "Your account has no branch assigned. Contact your administrator." });
            }
        } else {
            branch = selectedBranch;
            if (!branch || (typeof branch === "string" && !branch.trim())) {
                return res.status(400).json({ success: false, message: "Please select a branch before uploading." });
            }
        }

        const results = { created: [], errors: [], skipped: [] };

        for (let i = 0; i < vehicles.length; i++) {
            const row = vehicles[i];
            const rowNum = i + 1;

            // Validate basic required fields
            if (!row.make || !row.make.trim()) {
                results.errors.push({ row: rowNum, message: "Missing required field: make" });
                continue;
            }
            if (!row.model || !row.model.trim()) {
                results.errors.push({ row: rowNum, message: "Missing required field: model" });
                continue;
            }
            if (!row.year || isNaN(row.year)) {
                results.errors.push({ row: rowNum, message: "Missing or invalid required field: year" });
                continue;
            }
            if (!row.registrationNumber || !row.registrationNumber.trim()) {
                results.errors.push({ row: rowNum, message: "Missing required field: registrationNumber" });
                continue;
            }

            try {
                const regNumClean = row.registrationNumber.trim();
                const { Vehicle } = require("../Model/VehicleModel");
                const existingVehicle = await Vehicle.findOne({
                    "legalDocs.registrationNumber": { $regex: new RegExp(`^${regNumClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
                    isDeleted: false
                });
                if (existingVehicle) {
                    results.skipped.push({
                        row: rowNum,
                        registrationNumber: regNumClean,
                        message: `Vehicle with registration number '${regNumClean}' already exists (skipped).`
                    });
                    continue;
                }

                const mappedStatus = mapExcelStatus(row.status);
                // Prepare vehicle structure
                const vehicleData = {
                    status: mappedStatus,
                    createdBy: userId,
                    creatorRole: userRole,
                    purchaseDetails: {
                        branch: branch,
                        vendorName: row.vendorName ? row.vendorName.trim() : undefined,
                        purchaseDate: row.purchaseDate ? new Date(row.purchaseDate) : undefined,
                        purchasePrice: (row.purchasePrice && !isNaN(row.purchasePrice)) ? Number(row.purchasePrice) : undefined,
                        paymentMethod: row.paymentMethod || undefined,
                    },
                    basicDetails: {
                        make: row.make.trim(),
                        model: row.model.trim(),
                        year: Number(row.year),
                        category: row.category ? row.category.trim() : undefined,
                        fuelType: row.fuelType ? row.fuelType.trim() : undefined,
                        transmission: row.transmission || undefined,
                        colour: row.colour ? row.colour.trim() : undefined,
                        vin: (() => {
                            if (!row.vin) return undefined;
                            const clean = row.vin.toString().trim().toUpperCase();
                            if (!clean || clean === 'N/A' || clean === 'NA' || clean === '-' || clean === '—' || clean === 'NULL' || clean === 'UNDEFINED') {
                                return undefined;
                            }
                            return clean;
                        })(),
                        odometer: (row.odometer && !isNaN(row.odometer)) ? Number(row.odometer) : 0,
                        gpsSerialNumber: row.gpsSerialNumber ? row.gpsSerialNumber.trim() : undefined,
                        weeklyRent: (row.weeklyRent && !isNaN(row.weeklyRent)) ? Number(row.weeklyRent) : undefined,
                        sellingValue: (row.sellingValue && !isNaN(row.sellingValue)) ? Number(row.sellingValue) : undefined,
                        leaseDurationWeeks: (row.leaseDurationWeeks && !isNaN(row.leaseDurationWeeks)) ? Number(row.leaseDurationWeeks) : 260,
                        fleetNumber: row.fleetNumber ? row.fleetNumber.trim() : undefined,
                    },
                    legalDocs: {
                        registrationNumber: regNumClean,
                        registrationExpiry: row.registrationExpiry ? new Date(row.registrationExpiry) : undefined,
                    },
                    statusHistory: [{
                        status: mappedStatus,
                        changedBy: userId,
                        changedByRole: userRole,
                        timestamp: new Date(),
                        notes: "Vehicle created via bulk upload.",
                    }]
                };

                const newVehicle = await addVehicleService(vehicleData);
                results.created.push({ row: rowNum, id: newVehicle._id, vin: newVehicle.basicDetails.vin, make: newVehicle.basicDetails.make, model: newVehicle.basicDetails.model });
            } catch (err) {
                results.errors.push({ row: rowNum, message: err.message });
            }
        }

        const success = (results.created.length > 0 || results.skipped.length > 0);
        const statusCode = success ? 201 : 400;
        return res.status(statusCode).json({
            success,
            message: `${results.created.length} vehicle(s) created, ${results.skipped.length} skipped, ${results.errors.length} error(s).`,
            data: results,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const bulkUpdateVehicleRent = async (req, res) => {
    try {
        const { updates } = req.body;
        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ success: false, message: "Invalid payload. 'updates' must be an array of objects." });
        }

        const { Vehicle } = require("../Model/VehicleModel");
        const { Driver } = require("../../Driver/Model/DriverModel");
        const DriverService = require("../../Driver/Service/DriverService");

        const results = { updated: [], errors: [] };

        for (let i = 0; i < updates.length; i++) {
            const row = updates[i];
            const rowNum = i + 1;

            // Map keys flexibly (supporting spaces, underscores, casing)
            const registrationNumberRaw = row["Vehicle No"] || row["Vehicle_No"] || row["VehicleNo"] || row["registrationNumber"] || row["RegistrationNumber"] || row["registration_number"];
            const vinRaw = row["VIN Number"] || row["VIN_Number"] || row["VINNumber"] || row["vin"] || row["VIN"] || row["vinNumber"];
            const weeklyRentRaw = row["Weekly Rent"] || row["Weekly_Rent"] || row["WeeklyRent"] || row["weeklyRent"] || row["Weeklyrent"] || row["weekly_rent"];

            const registrationNumber = registrationNumberRaw ? registrationNumberRaw.toString().trim() : "";
            const vin = vinRaw ? vinRaw.toString().trim().toUpperCase() : "";
            const weeklyRent = weeklyRentRaw !== undefined ? Number(weeklyRentRaw) : NaN;

            if (!registrationNumber) {
                results.errors.push({ row: rowNum, message: "Missing required column: Vehicle No" });
                continue;
            }
            if (!vin) {
                results.errors.push({ row: rowNum, message: "Missing required column: VIN Number" });
                continue;
            }
            if (isNaN(weeklyRent) || weeklyRent < 0) {
                results.errors.push({ row: rowNum, message: "Missing or invalid Weekly Rent value" });
                continue;
            }

            try {
                // Find matching vehicle
                const vehicle = await Vehicle.findOne({
                    "legalDocs.registrationNumber": { $regex: new RegExp(`^${registrationNumber}$`, "i") },
                    "basicDetails.vin": { $regex: new RegExp(`^${vin}$`, "i") },
                    isDeleted: false
                });

                if (!vehicle) {
                    results.errors.push({ row: rowNum, message: `Vehicle not found matching Vehicle No: "${registrationNumber}" and VIN: "${vin}"` });
                    continue;
                }

                // Update vehicle basicDetails.weeklyRent
                vehicle.basicDetails.weeklyRent = weeklyRent;
                await vehicle.save();

                // Check for associated driver
                let driverId = vehicle.currentDriver;
                if (!driverId) {
                    const driverDoc = await Driver.findOne({ currentVehicle: vehicle._id, isDeleted: false });
                    if (driverDoc) driverId = driverDoc._id;
                }

                let driverUpdated = false;
                if (driverId) {
                    const scheduleRes = await DriverService.updateDriverRentScheduleForVehicle(driverId, vehicle._id, weeklyRent);
                    if (scheduleRes.success) {
                        driverUpdated = true;
                        // Run rollover to ensure overdue rent ledger consistency
                        await DriverService.rolloverOverdueRent(driverId);
                    }
                }

                results.updated.push({
                    row: rowNum,
                    id: vehicle._id,
                    vin: vehicle.basicDetails.vin,
                    registrationNumber: vehicle.legalDocs.registrationNumber,
                    weeklyRent: weeklyRent,
                    driverUpdated
                });
            } catch (rowErr) {
                results.errors.push({ row: rowNum, message: rowErr.message });
            }
        }

        const statusCode = results.updated.length > 0 ? 200 : 400;
        return res.status(statusCode).json({
            success: results.updated.length > 0,
            message: `${results.updated.length} vehicle(s) rent updated, ${results.errors.length} error(s).`,
            data: results
        });
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
    updateVehicle,
    getVehiclesDueForService,
    bulkAddVehicles,
    bulkUpdateVehicleRent,
};

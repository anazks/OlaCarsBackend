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
 * Get current logged-in driver's profile
 * @route GET /api/driver/me
 */
const getDriverMe = async (req, res) => {
    try {
        const email = req.user.email;
        if (!email) return res.status(400).json({ success: false, message: "User email not found in token" });

        const driver = await DriverService.getByEmail(email, { includeSensitive: false });
        if (!driver) return res.status(404).json({ success: false, message: "Driver profile not found" });

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
        
        console.log(`[Driver Upload] Starting upload for driver: ${driverId}`);

        const driver = await getDriverByIdService(driverId, { includeSensitive: false });
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        const files = req.files;
        console.log(`[Driver Upload] Files received:`, Object.keys(files || {}));
        
        if (!files || Object.keys(files).length === 0) {
            console.warn(`[Driver Upload] No files provided`);
            return res.status(400).json({ success: false, message: "No documents uploaded" });
        }

        const uploadedKeys = {};
        const dbUpdate = {};
        const uploadErrors = [];

        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;

            try {
                const file = fileArray[0];
                console.log(`[Driver Upload] Processing field: ${fieldName}, file: ${file.originalname}`);
                
                // Pass folder path only - uploadToS3 will handle timestamp and filename
                const folder = `drivers/${driverId}/documents`;
                const uploadedKey = await uploadToS3(file, folder);
                uploadedKeys[fieldName] = uploadedKey;
                console.log(`[Driver Upload] ✓ Field: ${fieldName}, URL: ${uploadedKey}`);

                // #3 — Map S3 field to DB path and queue for update
                const dbPath = S3_FIELD_MAP[fieldName];
                if (dbPath) {
                    dbUpdate[dbPath] = uploadedKey;
                }
            } catch (fieldError) {
                console.error(`[Driver Upload] ✗ Error uploading ${fieldName}:`, fieldError.message);
                uploadErrors.push(`${fieldName}: ${fieldError.message}`);
            }
        }

        if (uploadErrors.length > 0) {
            console.warn(`[Driver Upload] Some uploads failed:`, uploadErrors);
        }

        // #3 — Auto-update driver record with S3 keys
        if (Object.keys(dbUpdate).length > 0) {
            try {
                // backgroundCheck needs status set to UPLOADED when document is uploaded
                if (dbUpdate["backgroundCheck.document"]) {
                    dbUpdate["backgroundCheck.status"] = "UPLOADED";
                }
                console.log(`[Driver Upload] Updating driver record with:`, dbUpdate);
                await updateDriverService(driverId, dbUpdate);
                console.log(`[Driver Upload] ✓ Driver record updated successfully`);
            } catch (dbError) {
                console.error(`[Driver Upload] ✗ Error updating driver record:`, dbError.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: uploadErrors.length > 0 
                ? `Uploaded ${Object.keys(uploadedKeys).length} files with ${uploadErrors.length} error(s)` 
                : "Documents uploaded and driver record updated.",
            data: uploadedKeys,
            errors: uploadErrors.length > 0 ? uploadErrors : undefined,
        });
    } catch (error) {
        console.error(`[Driver Upload] ✗ Fatal error:`, error);
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
            weekNumber: Number(weekNumber),
            amount: Number(amount),
            paymentMethod,
            transactionId,
            note,
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

/**
 * Bulk-create driver applications from a parsed CSV/TXT payload.
 * Branch assignment logic:
 *   - OPERATIONSTAFF / FINANCESTAFF / BRANCHMANAGER: auto-assigned from JWT branchId.
 *   - COUNTRYMANAGER / ADMIN: must send req.body.branch (selected via dropdown in frontend).
 * The CSV file itself never contains a branch column.
 * @route POST /api/driver/bulk
 */
const bulkAddDrivers = async (req, res) => {
    try {
        const { drivers, branch: selectedBranch } = req.body;

        if (!Array.isArray(drivers) || drivers.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'drivers' array." });
        }

        if (drivers.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 drivers per bulk upload." });
        }

        const userRole = req.user.role;
        const userId = req.user.id;
        const userBranchId = req.user.branchId; // Present for OPERATIONSTAFF / FINANCESTAFF / BRANCHMANAGER

        // Roles that auto-assign branch from their own JWT branchId
        const autoAssignRoles = ["OPERATIONSTAFF", "FINANCESTAFF", "BRANCHMANAGER"];
        const isAutoAssign = autoAssignRoles.includes(userRole);

        // Determine the branch for ALL drivers in this batch
        let branch;
        if (isAutoAssign) {
            branch = userBranchId;
            if (!branch) {
                return res.status(400).json({ success: false, message: "Your account has no branch assigned. Contact your administrator." });
            }
        } else {
            // COUNTRYMANAGER / ADMIN must provide a branch via dropdown selection
            branch = selectedBranch;
            if (!branch || (typeof branch === "string" && !branch.trim())) {
                return res.status(400).json({ success: false, message: "Please select a branch before uploading." });
            }
        }

        const results = { created: [], errors: [] };

        for (let i = 0; i < drivers.length; i++) {
            const row = drivers[i];
            const rowNum = i + 1;

            // Validate required fields
            if (!row.fullName || !row.fullName.trim()) {
                results.errors.push({ row: rowNum, message: "Missing required field: fullName" });
                continue;
            }

            try {
                const driverData = {
                    personalInfo: {
                        fullName: row.fullName.trim(),
                        email: row.email ? row.email.trim().toLowerCase() : undefined,
                        phone: row.phone ? row.phone.trim() : undefined,
                        whatsappNumber: row.whatsappNumber ? row.whatsappNumber.trim() : undefined,
                        dateOfBirth: row.dateOfBirth || undefined,
                        nationality: row.nationality ? row.nationality.trim() : undefined,
                    },
                    identityDocs: {
                        idType: row.idType || undefined,
                        idNumber: row.idNumber ? row.idNumber.trim() : undefined,
                    },
                    drivingLicense: {
                        licenseNumber: row.licenseNumber ? row.licenseNumber.trim() : undefined,
                        licenseCountry: row.licenseCountry ? row.licenseCountry.trim() : undefined,
                        expiryDate: row.licenseExpiry || undefined,
                    },
                    emergencyContact: {
                        name: row.emergencyName ? row.emergencyName.trim() : undefined,
                        relationship: row.emergencyRelationship ? row.emergencyRelationship.trim() : undefined,
                        phone: row.emergencyPhone ? row.emergencyPhone.trim() : undefined,
                    },
                    branch: branch,
                    createdBy: userId,
                    creatorRole: userRole,
                };

                const newDriver = await DriverService.create(driverData);
                results.created.push({ row: rowNum, id: newDriver._id, name: row.fullName });
            } catch (err) {
                if (err.message && err.message.includes("E11000") && err.message.includes("email")) {
                    results.errors.push({ row: rowNum, message: `Email '${row.email}' is already in use by another driver in the database. Please use a unique email.` });
                } else if (err.message && err.message.includes("E11000") && err.message.includes("phone")) {
                    results.errors.push({ row: rowNum, message: `Phone number '${row.phone}' is already in use by another driver.` });
                } else {
                    results.errors.push({ row: rowNum, message: err.message });
                }
            }
        }

        const statusCode = results.created.length > 0 ? 201 : 400;
        return res.status(statusCode).json({
            success: results.created.length > 0,
            message: `${results.created.length} driver(s) created, ${results.errors.length} error(s).`,
            data: results,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Data Migration — Bulk-create drivers WITH vehicles from legacy system data.
 * Creates a vehicle per row, creates a driver, and links them.
 * Branch assignment follows the same logic as bulkAddDrivers.
 * @route POST /api/driver/data-migration
 */
const dataMigrateDrivers = async (req, res) => {
    try {
        const { drivers, branch: selectedBranch, handlingStaff, fleetNumber: providedFleetNumber, updateExisting } = req.body;

        if (!Array.isArray(drivers) || drivers.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'drivers' array." });
        }

        if (drivers.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 records per data migration upload." });
        }

        const userRole = req.user.role;
        const userId = req.user.id;
        const userBranchId = req.user.branchId;

        // Determine branch (same logic as bulkAddDrivers)
        const autoAssignRoles = ["OPERATIONSTAFF", "FINANCESTAFF", "BRANCHMANAGER"];
        const isAutoAssign = autoAssignRoles.includes(userRole);

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

        // Lazy-load Vehicle repo to avoid circular dependency issues
        const { addVehicleService, updateVehicleService } = require("../../Vehicle/Repo/VehicleRepo");
        const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
        const { Driver } = require("../../Driver/Model/DriverModel");
        const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
        const { generateNextFleetNumber } = require("../../FinanceStaff/Service/FinanceStaffService");

        let staffFleetNumber;
        let handlingStaffObj = null;
        let isNewFleetNumberAssigned = false;
        if (handlingStaff) {
            handlingStaffObj = await FinanceStaff.findById(handlingStaff);
            if (handlingStaffObj) {
                // Try to get from request, first record or generate a new one
                const firstRecordFleet = drivers.length > 0 ? (drivers[0].fleetNumber || drivers[0].vehicleFleetNumber) : null;
                const fleetToAssign = (providedFleetNumber || firstRecordFleet || await generateNextFleetNumber()).toString().trim();
                
                // Check if fleet is already assigned to another staff
                const otherStaff = await FinanceStaff.findOne({
                    fleetNumbers: fleetToAssign,
                    _id: { $ne: handlingStaffObj._id },
                    isDeleted: false
                });
                if (otherStaff) {
                    return res.status(409).json({ 
                        success: false, 
                        message: `Duplicate Key Found: Fleet ${fleetToAssign} is already assigned to ${otherStaff.fullName}.`,
                        errorType: 'DUPLICATE_FLEET'
                    });
                }

                // Add to staff's fleetNumbers array if not already there, but don't save yet
                if (!handlingStaffObj.fleetNumbers.includes(fleetToAssign)) {
                    handlingStaffObj.fleetNumbers.push(fleetToAssign);
                    isNewFleetNumberAssigned = true;
                }
                staffFleetNumber = fleetToAssign;
            }
        }

        const results = { created: [], errors: [] };

        for (let i = 0; i < drivers.length; i++) {
            const row = drivers[i];
            const rowNum = i + 1;

            // Validate required fields
            if (!row.fullName || !row.fullName.trim()) {
                results.errors.push({ row: rowNum, message: "Missing required field: fullName" });
                continue;
            }
            if (!row.vehicleNumber || !row.vehicleNumber.trim()) {
                results.errors.push({ row: rowNum, message: "Missing required field: vehicleNumber" });
                continue;
            }

            try {
                let vehicleId = null;
                let isVehicleUpdated = false;

                // ── 1. Vehicle Logic ──
                let existingVehicle = null;
                if (row.vehicleVin && row.vehicleVin.trim()) {
                    existingVehicle = await Vehicle.findOne({ "basicDetails.vin": row.vehicleVin.trim() });
                }
                if (!existingVehicle && row.vehicleNumber && row.vehicleNumber.trim()) {
                    existingVehicle = await Vehicle.findOne({ "legalDocs.registrationNumber": row.vehicleNumber.trim() });
                }

                if (existingVehicle) {
                    const newFleetNumber = staffFleetNumber || (row.fleetNumber || row.vehicleFleetNumber || "").toString().trim();
                    const currentFleetNumber = existingVehicle.basicDetails.fleetNumber;

                    if (currentFleetNumber && newFleetNumber && currentFleetNumber !== newFleetNumber) {
                        results.errors.push({ row: rowNum, message: `Vehicle ${row.vehicleNumber.trim()} is already assigned to fleet ${currentFleetNumber}. Cannot change fleet number to ${newFleetNumber}.` });
                        continue;
                    }

                    // Update existing vehicle
                    const vehicleUpdateData = {};
                    if (row.vehicleMake) vehicleUpdateData["basicDetails.make"] = row.vehicleMake.trim();
                    if (row.vehicleModel) vehicleUpdateData["basicDetails.model"] = row.vehicleModel.trim();
                    if (row.vehicleYear) vehicleUpdateData["basicDetails.year"] = Number(row.vehicleYear);
                    if (row.vehicleCategory) vehicleUpdateData["basicDetails.category"] = row.vehicleCategory.trim();
                    if (row.vehicleFuelType) vehicleUpdateData["basicDetails.fuelType"] = row.vehicleFuelType.trim();
                    if (row.vehicleColour) vehicleUpdateData["basicDetails.colour"] = row.vehicleColour.trim();
                    if (row.vehicleSellingValue || row.currentSellingValue) {
                        vehicleUpdateData["basicDetails.sellingValue"] = (row.vehicleSellingValue && !isNaN(row.vehicleSellingValue)) ? Number(row.vehicleSellingValue) : Number(row.currentSellingValue);
                    }
                    if (!currentFleetNumber && newFleetNumber) {
                        vehicleUpdateData["basicDetails.fleetNumber"] = newFleetNumber;
                    }
                    
                    if (Object.keys(vehicleUpdateData).length > 0) {
                        await updateVehicleService(existingVehicle._id, vehicleUpdateData);
                    }
                    vehicleId = existingVehicle._id;
                    isVehicleUpdated = true;
                } else {
                    // Create new vehicle
                    const vehicleData = {
                        status: "ACTIVE — RENTED",
                        handlingStaff: handlingStaff || undefined,
                        purchaseDetails: { branch: branch },
                        basicDetails: {
                            make: row.vehicleMake ? row.vehicleMake.trim() : undefined,
                            model: row.vehicleModel ? row.vehicleModel.trim() : undefined,
                            year: row.vehicleYear ? Number(row.vehicleYear) : undefined,
                            category: row.vehicleCategory ? row.vehicleCategory.trim() : undefined,
                            fuelType: row.vehicleFuelType ? row.vehicleFuelType.trim() : undefined,
                            colour: row.vehicleColour ? row.vehicleColour.trim() : undefined,
                            vin: row.vehicleVin ? row.vehicleVin.trim() : undefined,
                            sellingValue: (row.vehicleSellingValue && !isNaN(row.vehicleSellingValue)) ? Number(row.vehicleSellingValue) : ((row.currentSellingValue && !isNaN(row.currentSellingValue)) ? Number(row.currentSellingValue) : undefined),
                            fleetNumber: staffFleetNumber || (row.fleetNumber || row.vehicleFleetNumber || "").toString().trim() || undefined,
                        },
                        legalDocs: {
                            registrationNumber: row.vehicleNumber.trim(),
                        },
                        statusHistory: [{
                            status: "ACTIVE — RENTED",
                            changedBy: userId,
                            changedByRole: userRole,
                            timestamp: new Date(),
                            notes: "Vehicle migrated from legacy system.",
                        }],
                        createdBy: userId,
                        creatorRole: userRole,
                    };
                    const newVehicle = await addVehicleService(vehicleData);
                    vehicleId = newVehicle._id;
                }

                // ── 2. Driver Logic ──
                let existingDriver = null;

                // Create a flexible name regex to handle extra spaces and case insensitivity
                const escapedName = row.fullName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const nameRegex = new RegExp("^" + escapedName.replace(/\s+/g, '\\s+') + "$", "i");

                // 1. Try to match by currentVehicle (strongest link)
                if (vehicleId) {
                    existingDriver = await Driver.findOne({ 
                        "personalInfo.fullName": nameRegex,
                        "currentVehicle": vehicleId
                    });
                }

                // 2. Try to match by phone
                if (!existingDriver && row.phone && row.phone.trim()) {
                    existingDriver = await Driver.findOne({ "personalInfo.phone": row.phone.trim() });
                }

                // 3. Try to match by email 
                if (!existingDriver && row.email && row.email.trim()) {
                    existingDriver = await Driver.findOne({ 
                        "personalInfo.fullName": nameRegex,
                        "personalInfo.email": row.email.trim().toLowerCase() 
                    });
                }

                // 4. Try to match by fullName alone (last resort)
                if (!existingDriver) {
                    existingDriver = await Driver.findOne({ "personalInfo.fullName": nameRegex });
                }

                if (existingDriver) {
                    // Update existing driver
                    const driverUpdateData = {};
                    if (row.fullName) driverUpdateData["personalInfo.fullName"] = row.fullName.trim();
                    if (row.email) driverUpdateData["personalInfo.email"] = row.email.trim().toLowerCase();
                    if (row.whatsappNumber) driverUpdateData["personalInfo.whatsappNumber"] = row.whatsappNumber.trim();
                    if (row.dateOfBirth) driverUpdateData["personalInfo.dateOfBirth"] = row.dateOfBirth;
                    if (row.nationality) driverUpdateData["personalInfo.nationality"] = row.nationality.trim();
                    
                    if (row.idType) driverUpdateData["identityDocs.idType"] = row.idType;
                    if (row.idNumber) driverUpdateData["identityDocs.idNumber"] = row.idNumber.trim();
                    
                    if (row.licenseNumber) driverUpdateData["drivingLicense.licenseNumber"] = row.licenseNumber.trim();
                    if (row.licenseCountry) driverUpdateData["drivingLicense.licenseCountry"] = row.licenseCountry.trim();
                    if (row.licenseExpiry) driverUpdateData["drivingLicense.expiryDate"] = row.licenseExpiry;

                    if (row.emergencyName) driverUpdateData["emergencyContact.name"] = row.emergencyName.trim();
                    if (row.emergencyRelationship) driverUpdateData["emergencyContact.relationship"] = row.emergencyRelationship.trim();
                    if (row.emergencyPhone) driverUpdateData["emergencyContact.phone"] = row.emergencyPhone.trim();

                    if (row.handlingStaffId || handlingStaff) driverUpdateData["handlingStaff"] = row.handlingStaffId || handlingStaff;
                    if (row.activationDate) driverUpdateData["activationDate"] = row.activationDate;
                    if (row.deactivationDate) driverUpdateData["deactivationDate"] = row.deactivationDate;
                    if (row.remarks) driverUpdateData["remarks"] = row.remarks.trim();
                    if (branch) driverUpdateData["branch"] = branch;

                    driverUpdateData["currentVehicle"] = vehicleId;

                    if (Object.keys(driverUpdateData).length > 0) {
                        await updateDriverService(existingDriver._id, driverUpdateData);
                    }

                    results.created.push({
                        row: rowNum,
                        driverId: existingDriver.driverId,
                        driverDbId: existingDriver._id,
                        vehicleId: vehicleId,
                        name: row.fullName,
                        vehicleNumber: row.vehicleNumber,
                        updated: true
                    });
                } else {
                    // Create new driver
                    const driverData = {
                        status: "ACTIVE",
                        personalInfo: {
                            fullName: row.fullName.trim(),
                            email: row.email ? row.email.trim().toLowerCase() : undefined,
                            phone: row.phone ? row.phone.trim() : undefined,
                            whatsappNumber: row.whatsappNumber ? row.whatsappNumber.trim() : undefined,
                            dateOfBirth: row.dateOfBirth || undefined,
                            nationality: row.nationality ? row.nationality.trim() : undefined,
                        },
                        identityDocs: {
                            idType: row.idType || undefined,
                            idNumber: row.idNumber ? row.idNumber.trim() : undefined,
                        },
                        drivingLicense: {
                            licenseNumber: row.licenseNumber ? row.licenseNumber.trim() : undefined,
                            licenseCountry: row.licenseCountry ? row.licenseCountry.trim() : undefined,
                            expiryDate: row.licenseExpiry || undefined,
                        },
                        emergencyContact: {
                            name: row.emergencyName ? row.emergencyName.trim() : undefined,
                            relationship: row.emergencyRelationship ? row.emergencyRelationship.trim() : undefined,
                            phone: row.emergencyPhone ? row.emergencyPhone.trim() : undefined,
                        },
                        handlingStaff: row.handlingStaffId || handlingStaff || undefined,
                        activationDate: row.activationDate || undefined,
                        deactivationDate: row.deactivationDate || undefined,
                        remarks: row.remarks ? row.remarks.trim() : undefined,
                        currentVehicle: vehicleId,
                        branch: branch,
                        createdBy: userId,
                        creatorRole: userRole,
                    };
                    const newDriver = await DriverService.create(driverData);

                    results.created.push({
                        row: rowNum,
                        driverId: newDriver.driverId,
                        driverDbId: newDriver._id,
                        vehicleId: vehicleId,
                        name: row.fullName,
                        vehicleNumber: row.vehicleNumber,
                        updated: false
                    });
                }
            } catch (err) {
                if (err.message && err.message.includes("E11000") && err.message.includes("email")) {
                    results.errors.push({ row: rowNum, message: `Email '${row.email}' is already in use by another driver in the database. Please use a unique email.` });
                } else if (err.message && err.message.includes("E11000") && err.message.includes("phone")) {
                    results.errors.push({ row: rowNum, message: `Phone number '${row.phone}' is already in use by another driver.` });
                } else {
                    results.errors.push({ row: rowNum, message: err.message });
                }
            }
        }

        // Save the new fleet number only if at least one driver was successfully migrated
        if (handlingStaffObj && isNewFleetNumberAssigned && results.created.length > 0) {
            await handlingStaffObj.save();
        }

        const statusCode = results.created.length > 0 ? 201 : 400;
        return res.status(statusCode).json({
            success: results.created.length > 0,
            message: `${results.created.length} driver(s) migrated, ${results.errors.length} error(s).`,
            data: results,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Record a payment against a driver's additional payment (deposit, fee, etc.)
 * @route POST /api/driver/:id/additional-payments/:paymentId/pay
 */
const payAdditionalPayment = async (req, res) => {
    try {
        const driverId = req.params.id;
        const paymentId = req.params.paymentId;
        const { amount, paymentMethod, note } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: "Payment amount must be greater than 0" });
        }

        const driver = await getDriverByIdService(driverId);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        // Find the additional payment entry by _id
        const apIndex = driver.additionalPayments.findIndex(
            ap => ap._id.toString() === paymentId
        );
        if (apIndex === -1) {
            return res.status(404).json({ success: false, message: "Additional payment entry not found" });
        }

        const ap = driver.additionalPayments[apIndex];
        if (ap.status === "PAID") {
            return res.status(400).json({ success: false, message: "This payment is already fully paid" });
        }

        const timestamp = new Date();
        const paymentForThis = Math.min(amount, ap.balance);
        const newPaid = (ap.amountPaid || 0) + paymentForThis;
        const newBalance = Math.max(0, ap.amount - newPaid);
        let newStatus = "PENDING";
        if (newBalance <= 0) newStatus = "PAID";
        else if (newPaid > 0) newStatus = "PARTIAL";

        const paymentRecord = {
            amount: paymentForThis,
            paidAt: timestamp,
            paymentMethod: paymentMethod || "Cash",
            note: note || "",
        };

        const updates = {};
        updates[`additionalPayments.${apIndex}.amountPaid`] = newPaid;
        updates[`additionalPayments.${apIndex}.balance`] = newBalance;
        updates[`additionalPayments.${apIndex}.status`] = newStatus;
        if (newStatus === "PAID") {
            updates[`additionalPayments.${apIndex}.paidAt`] = timestamp;
        }
        updates.$push = {};
        updates.$push[`additionalPayments.${apIndex}.payments`] = paymentRecord;

        await updateDriverService(driverId, updates);

        // ── Sync linked Invoice status ──────────────────────────────────
        if (ap.invoiceRef) {
            try {
                const { Invoice } = require("../../Invoice/Model/InvoiceModel");
                const invoice = await Invoice.findById(ap.invoiceRef);
                if (invoice) {
                    invoice.amountPaid = (invoice.amountPaid || 0) + paymentForThis;
                    invoice.balance = Math.max(0, invoice.totalAmountDue - invoice.amountPaid);

                    if (invoice.balance <= 0) {
                        invoice.status = "PAID";
                        invoice.paidAt = timestamp;
                    } else if (invoice.amountPaid > 0) {
                        invoice.status = "PARTIAL";
                    }

                    invoice.payments.push({
                        amount: paymentForThis,
                        paidAt: timestamp,
                        paymentMethod: paymentMethod || "Cash",
                        note: note || `Additional payment recorded`,
                    });

                    await invoice.save();
                    console.log(`[DriverController] Synced Invoice ${invoice.invoiceNumber} → status: ${invoice.status}, balance: ${invoice.balance}`);
                }
            } catch (invoiceSyncErr) {
                console.error("[DriverController] Failed to sync linked Invoice:", invoiceSyncErr);
            }
        }

        // Create PaymentTransaction + Ledger entry on actual payment
        try {
            const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
            const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
            const LedgerService = require("../../Ledger/Service/LedgerService");

            const accCode = await AccountingCode.findOne({ code: "4000" });
            if (accCode) {
                const driverName = driver.personalInfo?.fullName || "Unknown Driver";

                let normalizedMethod = "OTHER";
                const methodUpper = paymentMethod ? paymentMethod.toUpperCase() : "CASH";
                if (methodUpper.includes("CASH")) normalizedMethod = "CASH";
                else if (methodUpper.includes("BANK") || methodUpper.includes("TRANSFER")) normalizedMethod = "BANK_TRANSFER";
                else if (methodUpper.includes("CARD")) normalizedMethod = "CREDIT_CARD";

                const txData = {
                    accountingCode: accCode._id,
                    referenceId: driverId,
                    referenceModel: "Driver",
                    transactionCategory: "INCOME",
                    transactionType: "CREDIT",
                    isTaxInclusive: false,
                    baseAmount: paymentForThis,
                    totalAmount: paymentForThis,
                    paymentMethod: normalizedMethod,
                    status: "COMPLETED",
                    paymentDate: timestamp,
                    notes: `${ap.type} Payment: ${ap.label} by ${driverName}${note ? ' - ' + note : ''}`,
                    createdBy: req.user.id,
                    creatorRole: req.user.role,
                };

                const newTx = await PaymentTransaction.create(txData);
                const populatedTx = { ...newTx.toObject(), accountingCode: accCode };
                await LedgerService.autoGenerateLedgerEntry(populatedTx);
                console.log(`[DriverController] Ledger entry created for additional payment ${paymentId}`);

                // Zoho Accounting Integration: Auto-create PaymentReceived record
                try {
                    const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
                    const prData = {
                        paymentNumber: `PR-${Date.now()}`,
                        driverId: driverId,
                        amountReceived: paymentForThis,
                        paymentDate: timestamp,
                        paymentMethod: paymentMethod || "Cash",
                        notes: `${ap.type} Payment: ${ap.label} by ${driverName}${note ? ' - ' + note : ''}`,
                        invoices: [], // Additional payment recorded on account
                        status: "COMPLETED"
                    };
                    const prDoc = await PaymentReceived.create(prData);
                    console.log(`[DriverController] PaymentReceived record created for additional payment: ${prDoc.paymentNumber}`);
                } catch (prErr) {
                    console.error("[DriverController] Failed to auto-create PaymentReceived for additional payment:", prErr);
                }
            }
        } catch (ledgerErr) {
            console.error("[DriverController] Failed to create ledger for additional payment:", ledgerErr);
        }

        const updatedDriver = await getDriverByIdService(driverId);
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

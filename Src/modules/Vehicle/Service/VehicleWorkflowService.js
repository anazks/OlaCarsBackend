const { getVehicleByIdService, updateVehicleService } = require("../Repo/VehicleRepo");
const { VEHICLE_STATUSES } = require("../Model/VehicleModel");
const { ROLES } = require("../../../shared/constants/roles");

const ROLE_HIERARCHY = {
    [ROLES.OPERATIONSTAFF]: 1,
    [ROLES.FINANCESTAFF]: 1,
    [ROLES.WORKSHOPSTAFF]: 2,
    [ROLES.BRANCHMANAGER]: 3,
    [ROLES.COUNTRYMANAGER]: 4,
    [ROLES.OPERATIONADMIN]: 5,
    [ROLES.FINANCEADMIN]: 5,
    [ROLES.ADMIN]: 6,
};

// Refactored helper
const checkRoleAuth = (userRole, allowedRoles, minimumHierarchyRole) => {
    if (allowedRoles.includes(userRole)) return true;
    if (minimumHierarchyRole && ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumHierarchyRole]) return true;
    return false;
};

// System statuses that cannot be directly forced manually by users besides ADMINs
const SYSTEM_STATUSES = [
    "ACTIVE — RENTED"
];

// Configuration object containing workflow transitions, validations, and auth
const STATUS_RULES = {
    "PENDING ENTRY": {
        allowedFrom: ["DOCUMENTS REVIEW"], // Rejection loop
        allowedRoles: [ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
    },
    "DOCUMENTS REVIEW": {
        allowedFrom: ["PENDING ENTRY", "INSPECTION REQUIRED"], // From start or returned
        allowedRoles: [ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (vehicle, payload) => {
            const combinedDocs = { ...vehicle.legalDocs, ...payload.legalDocs };
            if (!combinedDocs.registrationCertificate || !combinedDocs.roadTaxDisc || !combinedDocs.roadworthinessCertificate) {
                return "All mandatory documents (Reg Cert, Road Tax, Roadworthiness) must be uploaded.";
            }
            return null;
        }
    },
    "INSPECTION REQUIRED": {
        allowedFrom: ["DOCUMENTS REVIEW", "REPAIR IN PROGRESS"],
        allowedRoles: [ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (vehicle, payload) => {
            const inspection = { ...vehicle.inspection, ...payload.inspection };

            if (!inspection.checklistItems || inspection.checklistItems.length < 23) {
                return "All 23 inspection checklist items must be completed.";
            }

            if (!inspection.exteriorPhotos || inspection.exteriorPhotos.length < 6) {
                return "Minimum 6 exterior photos are required.";
            }

            if (!inspection.odometerPhoto) {
                return "Odometer photo is mandatory.";
            }

            return null;
        }
    },
    "INSPECTION FAILED": {
        allowedFrom: ["INSPECTION REQUIRED"],
        allowedRoles: [ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.ADMIN,
    },
    "REPAIR IN PROGRESS": {
        allowedFrom: ["INSPECTION FAILED"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.ADMIN,
    },
    "ACCOUNTING SETUP": {
        allowedFrom: ["INSPECTION REQUIRED", "REPAIR IN PROGRESS"],
        allowedRoles: [ROLES.FINANCESTAFF],
        minHierarchy: ROLES.ADMIN,
    },
    "GPS ACTIVATION": {
        allowedFrom: ["ACCOUNTING SETUP"],
        allowedRoles: [ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (vehicle, payload) => {
            const combinedAcct = { ...vehicle.accountingSetup, ...payload.accountingSetup };
            if (!combinedAcct.isSetupComplete) {
                return "Accounting Setup must be confirmed complete before GPS Activation.";
            }
            return null;
        }
    },
    "BRANCH MANAGER APPROVAL": {
        allowedFrom: ["GPS ACTIVATION", "ACTIVE — AVAILABLE"],
        allowedRoles: [ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.ADMIN,
        gateValidator: (vehicle, payload) => {
            const combinedGps = { ...vehicle.gpsConfiguration, ...payload.gpsConfiguration };
            if (!combinedGps.isActivated) {
                return "GPS Must be synced and activated before approval.";
            }
            return null;
        }
    },
    "ACTIVE — AVAILABLE": {
        allowedFrom: ["BRANCH MANAGER APPROVAL", "ACTIVE — RENTED", "ACTIVE — MAINTENANCE"],
        allowedRoles: [ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.ADMIN,
    },
    "ACTIVE — RENTED": {
        allowedFrom: ["ACTIVE — AVAILABLE"],
        allowedRoles: [], // System triggered by booking
        minHierarchy: ROLES.ADMIN,
        gateValidator: (vehicle, payload) => {
            const today = new Date();

            // Expiry Checks
            if (vehicle.legalDocs?.registrationExpiry && new Date(vehicle.legalDocs.registrationExpiry) < today) {
                return "Cannot rent: Registration has expired.";
            }
            if (vehicle.legalDocs?.roadTaxExpiry && new Date(vehicle.legalDocs.roadTaxExpiry) < today) {
                return "Cannot rent: Road Tax has expired.";
            }
            if (vehicle.insurancePolicy?.expiryDate && new Date(vehicle.insurancePolicy.expiryDate) < today) {
                return "Cannot rent: Insurance policy has expired.";
            }

            return null;
        }
    },
    "ACTIVE — MAINTENANCE": {
        allowedFrom: ["ACTIVE — AVAILABLE", "ACTIVE — RENTED"],
        allowedRoles: [ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.ADMIN,
    },
    "RETIRED": {
        allowedFrom: ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "ACTIVE — MAINTENANCE"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER],
        minHierarchy: ROLES.ADMIN,
    }
};

/**
 * Triggers external events (like other Services) based on a successful transition.
 */
const triggerExternalActions = (targetStatus, vehicleId) => {
    if (targetStatus === "ACCOUNTING SETUP") {
        console.log(`[Event Action] Dispatching Vehicle ${vehicleId} to Accounting Service API...`);
    } else if (targetStatus === "GPS ACTIVATION") {
        console.log(`[Event Action] Pinging physical GPS APIs to confirm active sync mapping for Vehicle ${vehicleId}...`);
    } else if (targetStatus === "ACTIVE — AVAILABLE") {
        console.log(`[Event Action] Auto-generating preventative maintenance schedule blocks for Vehicle ${vehicleId}...`);
    }
};

/**
 * The single source of truth for processing vehicle status workflows.
 */
const processVehicleProgress = async (vehicleId, targetStatus, updateData, user) => {
    const currentVehicle = await getVehicleByIdService(vehicleId);
    if (!currentVehicle) {
        throw new Error("Vehicle not found", { cause: 404 });
    }

    if (!VEHICLE_STATUSES.includes(targetStatus)) {
        throw new Error("Invalid target status provided.", { cause: 400 });
    }

    if (currentVehicle.status === targetStatus) {
        return await updateVehicleService(vehicleId, updateData);
    }

    const rule = STATUS_RULES[targetStatus];
    if (!rule) {
        throw new Error("Invalid target status configuration.", { cause: 500 });
    }

    if (SYSTEM_STATUSES.includes(targetStatus) && !checkRoleAuth(user.role, [], ROLES.ADMIN)) {
        throw new Error(`Manual transition to system status '${targetStatus}' is blocked.`, { cause: 403 });
    }

    if (!rule.allowedFrom.includes(currentVehicle.status)) {
        throw new Error(`Invalid transition sequence. Cannot progress from '${currentVehicle.status}' to '${targetStatus}'.`, { cause: 400 });
    }

    if (!checkRoleAuth(user.role, rule.allowedRoles, rule.minHierarchy)) {
        throw new Error(`User role '${user.role}' is not authorized to finalize the ${targetStatus} stage.`, { cause: 403 });
    }

    const payload = { ...updateData };

    if (rule.gateValidator) {
        const errorMsg = rule.gateValidator(currentVehicle, payload);
        if (errorMsg) {
            throw new Error(errorMsg, { cause: 400 });
        }
    }

    // Auto-calculate landed cost if importation details are modified
    if (payload.importationDetails && payload.importationDetails.isImported) {
        const imp = payload.importationDetails;
        payload.importationDetails.landedCost =
            (imp.shippingCost || 0) +
            (imp.customsDuty || 0) +
            (imp.portHandling || 0) +
            (imp.localTransport || 0) +
            (imp.otherCharges || 0);
    }

    payload.status = targetStatus;
    const updatedVehicle = await updateVehicleService(vehicleId, payload);

    updatedVehicle.statusHistory.push({
        status: targetStatus,
        changedBy: user.id,
        changedByRole: user.role,
        notes: updateData?.notes || `Status changed from ${currentVehicle.status} to ${targetStatus}`,
    });

    await updatedVehicle.save();

    // Side effects logic separated from pure validation
    triggerExternalActions(targetStatus, vehicleId);

    return updatedVehicle;
};

module.exports = {
    processVehicleProgress,
    STATUS_RULES
};

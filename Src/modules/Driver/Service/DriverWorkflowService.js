const mongoose = require("mongoose");
const { getDriverByIdService, updateDriverService } = require("../Repo/DriverRepo");
const { DRIVER_STATUSES } = require("../Model/DriverModel");
const { ROLES } = require("../../../shared/constants/roles");

// ─── Role Hierarchy (reuses project pattern) ──────────────────────────
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

function checkRoleAuth(userRole, allowedRoles, minimumHierarchyRole) {
    if (allowedRoles.includes(userRole)) return true;
    return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[minimumHierarchyRole] || 99);
}

// ─── Field Whitelists Per Stage (#7) ──────────────────────────────────
// Only these top-level fields can be updated when transitioning TO a status.
// Prevents users from injecting activation/rejection/credit fields arbitrarily.
const STAGE_ALLOWED_FIELDS = {
    "PENDING REVIEW": ["personalInfo", "identityDocs", "drivingLicense", "addressProof", "emergencyContact", "medicalFitness", "notes"],
    "VERIFICATION": ["drivingLicense", "backgroundCheck", "notes"],
    "CREDIT CHECK": ["creditCheck", "notes"],
    "MANAGER REVIEW": ["creditCheck", "notes"],
    "APPROVED": ["creditCheck", "notes"],
    "REJECTED": ["rejection", "notes"],
    "CONTRACT PENDING": ["contract", "notes"],
    "ACTIVE": ["activation", "notes"],
    "SUSPENDED": ["suspension", "notes"],
};

/**
 * Strips fields not in the whitelist for the given target status.
 */
function enforceFieldWhitelist(updateData, targetStatus) {
    const allowed = STAGE_ALLOWED_FIELDS[targetStatus];
    if (!allowed) return updateData;

    const sanitized = {};
    for (const key of Object.keys(updateData)) {
        if (allowed.includes(key)) {
            sanitized[key] = updateData[key];
        }
    }
    return sanitized;
}

// ─── Custom Error with statusCode (#2) ────────────────────────────────
function workflowError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// ─── Workflow Status Rules ────────────────────────────────────────────
const STATUS_RULES = {
    "PENDING REVIEW": {
        allowedFrom: ["DRAFT"],
        allowedRoles: [ROLES.FINANCESTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator(driver, payload) {
            const p = driver.personalInfo || {};
            const id = driver.identityDocs || {};
            const dl = driver.drivingLicense || {};
            const ec = driver.emergencyContact || {};

            const missing = [];
            if (!p.fullName) missing.push("personalInfo.fullName");
            if (!p.email) missing.push("personalInfo.email");
            if (!p.phone) missing.push("personalInfo.phone");
            if (!id.idFrontImage) missing.push("identityDocs.idFrontImage");
            if (!id.idBackImage) missing.push("identityDocs.idBackImage");
            if (!dl.frontImage) missing.push("drivingLicense.frontImage");
            if (!dl.backImage) missing.push("drivingLicense.backImage");
            if (!dl.licenseNumber) missing.push("drivingLicense.licenseNumber");
            if (!dl.expiryDate) missing.push("drivingLicense.expiryDate");
            if (!ec.name) missing.push("emergencyContact.name");
            if (!ec.phone) missing.push("emergencyContact.phone");

            if (missing.length > 0) {
                return `Missing required fields: ${missing.join(", ")}`;
            }
            return null;
        },
    },

    "VERIFICATION": {
        allowedFrom: ["PENDING REVIEW"],
        allowedRoles: [ROLES.FINANCESTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator(driver) {
            const dl = driver.drivingLicense || {};
            const bg = driver.backgroundCheck || {};

            if (dl.verificationStatus !== "VERIFIED") {
                return "Driving license must be verified before proceeding.";
            }
            if (!bg.document || bg.status === "NOT PROVIDED") {
                return "Background check document must be uploaded.";
            }
            return null;
        },
    },

    "CREDIT CHECK": {
        allowedFrom: ["VERIFICATION"],
        allowedRoles: [ROLES.FINANCESTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator(driver) {
            const cc = driver.creditCheck || {};
            if (!cc.consentForm) {
                return "Signed credit check consent form must be uploaded before initiating.";
            }
            return null;
        },
    },

    "MANAGER REVIEW": {
        allowedFrom: ["CREDIT CHECK"],
        allowedRoles: [], // System-triggered only
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator(driver) {
            const cc = driver.creditCheck || {};
            if (!cc.score) {
                return "Credit score must be recorded before manager review.";
            }
            if (cc.decision !== "MANUAL_REVIEW") {
                return "Only borderline cases (score 500–649) require manager review.";
            }
            return null;
        },
    },

    "APPROVED": {
        allowedFrom: ["CREDIT CHECK", "MANAGER REVIEW"],
        allowedRoles: [ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator(driver) {
            const cc = driver.creditCheck || {};
            if (!cc.score) {
                return "Credit score must be present.";
            }
            if (cc.decision === "DECLINED") {
                return "Cannot approve a declined credit check. Transition to REJECTED instead.";
            }
            return null;
        },
    },

    "REJECTED": {
        allowedFrom: ["CREDIT CHECK", "MANAGER REVIEW", "PENDING REVIEW", "VERIFICATION"],
        allowedRoles: [ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.COUNTRYMANAGER,
        gateValidator(driver, payload) {
            const rejection = payload?.rejection || {};
            if (!rejection.reason) {
                return "Rejection reason is required.";
            }
            return null;
        },
    },

    "CONTRACT PENDING": {
        allowedFrom: ["APPROVED"],
        allowedRoles: [ROLES.FINANCESTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator(driver) {
            const c = driver.contract || {};
            if (!c.generatedS3Key) {
                return "Contract PDF must be generated/uploaded before issuing.";
            }
            return null;
        },
    },

    "ACTIVE": {
        allowedFrom: ["CONTRACT PENDING", "SUSPENDED"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.OPERATIONSTAFF,
        gateValidator(driver) {
            if (driver.status === "CONTRACT PENDING") {
                const c = driver.contract || {};
                if (!c.signedS3Key) {
                    return "Signed contract must be uploaded before activation.";
                }
            }
            return null;
        },
    },

    "SUSPENDED": {
        allowedFrom: ["ACTIVE"],
        allowedRoles: [ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.COUNTRYMANAGER,
        gateValidator(driver, payload) {
            const susp = payload?.suspension || {};
            if (!susp.reason) {
                return "Suspension reason is required.";
            }
            return null;
        },
    },
};

// ─── Credit Score Auto-Decision Engine ────────────────────────────────
function evaluateCreditScore(score, hasFraudAlert = false) {
    if (score == null) return null;

    // #5 — Fraud alert: immediate rejection, no override
    if (hasFraudAlert) {
        return { rating: "FRAUD", decision: "DECLINED" };
    }

    let rating, decision;

    if (score >= 750) {
        rating = "EXCELLENT";
        decision = "AUTO_APPROVED";
    } else if (score >= 650) {
        rating = "GOOD";
        decision = "AUTO_APPROVED";
    } else if (score >= 500) {
        rating = "FAIR";
        decision = "MANUAL_REVIEW";
    } else if (score >= 350) {
        rating = "POOR";
        decision = "DECLINED";
    } else {
        rating = "VERY POOR";
        decision = "DECLINED";
    }

    return { rating, decision };
}

// ─── Side Effects (post-transition actions) ───────────────────────────
function applySideEffects(targetStatus, driver, updatePayload) {
    switch (targetStatus) {
        case "CREDIT CHECK":
            // #6 — System auto-decides: rating & decision are always set by engine, never from payload
            if (updatePayload?.creditCheck) {
                // If api for experian is not yet available, we use dummy score
                if (!updatePayload.creditCheck.score) {
                    updatePayload.creditCheck.score = Math.floor(Math.random() * (850 - 300 + 1)) + 300;
                    updatePayload.creditCheck.isDummy = true;
                    updatePayload.creditCheck.notes = (updatePayload.creditCheck.notes || "") + " [System: Generated dummy score as API is unavailable]";
                }

                const hasFraud = updatePayload.creditCheck.fraudAlert === true;
                const evaluation = evaluateCreditScore(updatePayload.creditCheck.score, hasFraud);
                if (evaluation) {
                    updatePayload.creditCheck.rating = evaluation.rating;
                    updatePayload.creditCheck.decision = evaluation.decision;
                    updatePayload.creditCheck.checkedDate = new Date();
                }
            }
            break;

        case "SUSPENDED":
            updatePayload.suspension = {
                ...(updatePayload.suspension || {}),
                previousStatus: driver.status,
                suspendedDate: new Date(),
            };
            break;

        case "REJECTED":
            updatePayload.rejection = {
                ...(updatePayload.rejection || {}),
                rejectedDate: new Date(),
            };
            break;

        case "ACTIVE":
            if (driver.status === "CONTRACT PENDING") {
                updatePayload.activation = {
                    ...(updatePayload.activation || {}),
                    activatedDate: new Date(),
                };
            }
            if (driver.status === "SUSPENDED") {
                updatePayload.suspension = {};
            }
            break;

        case "CONTRACT PENDING":
            updatePayload.contract = {
                ...(updatePayload.contract || {}),
                issuedDate: new Date(),
            };
            break;
    }
}

// ─── Main Workflow Processor ──────────────────────────────────────────
/**
 * Processes driver status transitions with full validation, field whitelisting,
 * auto-decision enforcement, and MongoDB transaction support.
 */
async function processDriverProgress(driverId, targetStatus, updateData = {}, user) {
    // 1. Validate target status exists
    if (!DRIVER_STATUSES.includes(targetStatus)) {
        throw workflowError(`Invalid target status: "${targetStatus}". Valid: ${DRIVER_STATUSES.join(", ")}`, 400);
    }

    // 2. Fetch current driver (with sensitive fields for workflow processing)
    const driver = await getDriverByIdService(driverId, { includeSensitive: true });
    if (!driver) {
        throw workflowError("Driver not found.", 404);
    }

    const currentStatus = driver.status;

    // 3. No-op if already at target
    if (currentStatus === targetStatus) {
        throw workflowError(`Driver is already in "${targetStatus}" status.`, 400);
    }

    // 4. Get rule for target status
    const rule = STATUS_RULES[targetStatus];
    if (!rule) {
        throw workflowError(`No workflow rule defined for status "${targetStatus}".`, 400);
    }

    // 5. Validate transition path
    if (!rule.allowedFrom.includes(currentStatus)) {
        throw workflowError(
            `Cannot transition from "${currentStatus}" to "${targetStatus}". Allowed from: [${rule.allowedFrom.join(", ")}].`,
            403
        );
    }

    // 6. Authorize user role
    if (!checkRoleAuth(user.role, rule.allowedRoles, rule.minHierarchy)) {
        throw workflowError(
            `Role "${user.role}" is not authorized for this transition. Required: [${rule.allowedRoles.join(", ")}] or hierarchy >= ${rule.minHierarchy}.`,
            403
        );
    }

    // 7. Enforce field whitelist (#7) — strip disallowed fields from payload
    updateData = enforceFieldWhitelist(updateData, targetStatus);

    // 8. Apply side effects BEFORE gate validation (so auto-decisions are available)
    applySideEffects(targetStatus, driver, updateData);

    // 9. #5 — Fraud alert auto-rejection: if credit check has fraud, force REJECTED
    if (targetStatus === "CREDIT CHECK" && updateData?.creditCheck?.decision === "DECLINED" && updateData?.creditCheck?.rating === "FRAUD") {
        // Override target to REJECTED — fraud cannot proceed
        const rejectionUpdate = {
            status: "REJECTED",
            creditCheck: updateData.creditCheck,
            rejection: {
                reason: "FRAUD ALERT",
                notes: "Experian fraud alert flagged. Application auto-rejected. No manual override permitted.",
                rejectedDate: new Date(),
                rejectedBy: user.id,
                rejectedByRole: user.role,
            },
            $push: {
                statusHistory: {
                    status: "REJECTED",
                    changedBy: user.id,
                    changedByRole: user.role,
                    timestamp: new Date(),
                    notes: "Auto-rejected: Experian fraud alert.",
                },
            },
        };

        // Use transaction for atomic update
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            const result = await updateDriverService(driverId, rejectionUpdate, session);
            await session.commitTransaction();
            return result;
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    }

    // 10. Build update payload — merge incoming data onto existing driver for gate check
    const mergedDriver = mergeDeep(driver.toObject(), updateData);

    // 11. Run gate validator
    if (rule.gateValidator) {
        const validationError = rule.gateValidator(mergedDriver, updateData);
        if (validationError) {
            throw workflowError(`Gate validation failed: ${validationError}`, 422);
        }
    }

    // 12. #6 — Prevent manual override of credit decision
    //     If we're at CREDIT CHECK and score was provided, the system decision is final.
    //     User cannot manually provide rating/decision — they were set by applySideEffects.

    // 13. Build final update object
    const finalUpdate = {
        ...updateData,
        status: targetStatus,
        $push: {
            statusHistory: {
                status: targetStatus,
                changedBy: user.id,
                changedByRole: user.role,
                timestamp: new Date(),
                notes: updateData.notes || null,
            },
        },
    };

    delete finalUpdate.notes;

    // 14. Execute with transaction (#10)
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const updatedDriver = await updateDriverService(driverId, finalUpdate, session);
        await session.commitTransaction();
        return updatedDriver;
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

// ─── Utility: Deep Merge ──────────────────────────────────────────────
function mergeDeep(target, source) {
    if (!source) return target;
    const output = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object"
        ) {
            output[key] = mergeDeep(target[key], source[key]);
        } else {
            output[key] = source[key];
        }
    }
    return output;
}

module.exports = {
    processDriverProgress,
    evaluateCreditScore,
    STATUS_RULES,
    STAGE_ALLOWED_FIELDS,
};

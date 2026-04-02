const mongoose = require("mongoose");
const crypto = require("crypto");
const { ROLES } = require("../../../shared/constants/roles");

// ─── Bank Detail Encryption (AES-256-CBC) ─────────────────────────────
const ALGO = "aes-256-cbc";
const IV_LENGTH = 16;

function encryptField(text) {
    if (!text || !process.env.BANK_ENCRYPTION_KEY) return text;
    const key = Buffer.from(process.env.BANK_ENCRYPTION_KEY, "hex"); // 32-byte hex key
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}

function decryptField(text) {
    if (!text || !text.includes(":") || !process.env.BANK_ENCRYPTION_KEY) return text;
    try {
        const key = Buffer.from(process.env.BANK_ENCRYPTION_KEY, "hex");
        const [ivHex, encrypted] = text.split(":");
        const iv = Buffer.from(ivHex, "hex");
        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch {
        return text; // Return as-is if decryption fails (not encrypted)
    }
}

// ─── Streamlined Driver Onboarding Statuses ───────────────────────────
const DRIVER_STATUSES = [
    "DRAFT",                  // Profile created, documents not yet complete
    "PENDING REVIEW",         // All docs submitted, awaiting staff verification
    "VERIFICATION",           // License & background verified, ready for credit check
    "CREDIT CHECK",           // Experian credit check in progress
    "MANAGER REVIEW",         // Borderline credit score — needs Branch Manager decision
    "APPROVED",               // Credit cleared, contract can be generated
    "CONTRACT PENDING",       // Contract issued, awaiting driver signature
    "ACTIVE",                 // Fully onboarded and operational
    "SUSPENDED",              // Temporarily disabled (doc expiry, breach, etc.)
    "REJECTED",               // Application declined (poor credit, fraud, etc.)
];

// ─── Sub-schemas ──────────────────────────────────────────────────────
const statusHistorySchema = new mongoose.Schema({
    status: { type: String, enum: DRIVER_STATUSES },
    changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "statusHistory.changedByRole" },
    changedByRole: { type: String },
    timestamp: { type: Date, default: Date.now },
    notes: { type: String },
}, { _id: false });

// ─── Main Driver Schema ──────────────────────────────────────────────
const driverSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: DRIVER_STATUSES,
            default: "DRAFT",
        },

        // ── 1. Personal Information ──────────────────────────────────
        personalInfo: {
            fullName: { type: String, required: true, trim: true },
            dateOfBirth: { type: Date },
            nationality: { type: String, trim: true },
            email: { type: String, lowercase: true, trim: true },
            phone: { type: String, trim: true },
            whatsappNumber: { type: String, trim: true },
            photograph: { type: String }, // S3 key
        },

        // ── 2. Identity Documents ────────────────────────────────────
        identityDocs: {
            idType: { type: String, enum: ["National ID", "Passport"] },
            idNumber: { type: String, trim: true },
            idFrontImage: { type: String }, // S3
            idBackImage: { type: String }, // S3
        },

        // ── 3. Driving License ───────────────────────────────────────
        drivingLicense: {
            licenseNumber: { type: String, trim: true },
            licenseCountry: { type: String, trim: true },
            categories: [{ type: String }], // e.g. ["B", "C1"]
            frontImage: { type: String }, // S3
            backImage: { type: String }, // S3
            expiryDate: { type: Date },
            verificationStatus: {
                type: String,
                enum: ["PENDING", "VERIFIED", "FAILED"],
                default: "PENDING",
            },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "drivingLicense.verifiedByRole" },
            verifiedByRole: { type: String },
            verifiedDate: { type: Date },
        },

        // ── 4. Background Check ──────────────────────────────────────
        backgroundCheck: {
            document: { type: String }, // S3
            issuedDate: { type: Date },
            status: {
                type: String,
                enum: ["NOT PROVIDED", "UPLOADED", "CLEARED"],
                default: "NOT PROVIDED",
            },
        },

        // ── 5. Address Proof ─────────────────────────────────────────
        addressProof: {
            document: { type: String }, // S3
            documentDate: { type: Date },   // must be < 3 months old
        },

        // ── 6. Emergency Contact ─────────────────────────────────────
        emergencyContact: {
            name: { type: String, trim: true },
            relationship: { type: String, trim: true },
            phone: { type: String, trim: true },
        },

        // ── 7. Bank Details (finance-visible only, encrypted at rest) ─
        bankDetails: {
            bankName: { type: String, trim: true },
            accountNumber: { type: String, trim: true, set: encryptField, get: decryptField },
            branchCode: { type: String, trim: true },
            accountHolder: { type: String, trim: true },
        },

        // ── 8. Medical Fitness ───────────────────────────────────────
        medicalFitness: {
            certificate: { type: String }, // S3
            expiryDate: { type: Date },
            isRequired: { type: Boolean, default: false }, // country-level flag
        },

        // ── 9. Credit Check (Experian) ───────────────────────────────
        creditCheck: {
            consentForm: { type: String }, // S3 — signed consent
            score: { type: Number }, // 300–850
            rating: {
                type: String,
                enum: ["EXCELLENT", "GOOD", "FAIR", "POOR", "VERY POOR", "FRAUD"],
            },
            decision: {
                type: String,
                enum: ["AUTO_APPROVED", "MANUAL_REVIEW", "DECLINED"],
            },
            reportS3Key: { type: String },   // full Experian report stored in S3
            checkedDate: { type: Date },
            reviewNotes: { type: String },    // BM notes for borderline cases
            reviewedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "creditCheck.reviewedByRole" },
            reviewedByRole: { type: String },
            reviewDate: { type: Date },
        },

        // ── 10. Contract ─────────────────────────────────────────────
        contract: {
            generatedS3Key: { type: String },   // system-generated PDF
            signedS3Key: { type: String },   // signed copy uploaded
            issuedDate: { type: Date },
            signedDate: { type: Date },
        },

        // ── 11. Activation ───────────────────────────────────────────
        activation: {
            checklistDocument: { type: String }, // S3 key
            credentialsSent: { type: Boolean, default: false },
            gpsMonitoringActive: { type: Boolean, default: false },
            activatedDate: { type: Date },
            activatedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "activation.activatedByRole" },
            activatedByRole: { type: String },
        },

        // ── 12. Suspension ───────────────────────────────────────────
        suspension: {
            reason: {
                type: String,
                enum: ["DOCUMENT EXPIRY", "GPS SCORE BREACH", "POLICY VIOLATION", "MANAGER ACTION", "OTHER"],
            },
            notes: { type: String },
            suspendedDate: { type: Date },
            previousStatus: { type: String, enum: DRIVER_STATUSES },
        },

        // ── 13. Rejection ────────────────────────────────────────────
        rejection: {
            reason: {
                type: String,
                enum: ["CREDIT DECLINED", "FRAUD ALERT", "DOCUMENT FRAUD", "FAILED VERIFICATION", "OTHER"],
            },
            notes: { type: String },
            rejectedDate: { type: Date },
            rejectedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "rejection.rejectedByRole" },
            rejectedByRole: { type: String },
        },

        // ── Branch Assignment ────────────────────────────────────────
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        currentVehicle: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
        },

        // ── Audit ────────────────────────────────────────────────────
        statusHistory: [statusHistorySchema],

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: [ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN,ROLES.FINANCESTAFF],
        },

        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

// ─── Performance Indexes ──────────────────────────────────────────────
driverSchema.index({ status: 1 });
driverSchema.index({ branch: 1 });
driverSchema.index({ "personalInfo.email": 1 }, { unique: true, sparse: true });
driverSchema.index({ "drivingLicense.expiryDate": 1 });
driverSchema.index({ "medicalFitness.expiryDate": 1 });

module.exports = {
    Driver: mongoose.model("Driver", driverSchema),
    DRIVER_STATUSES,
};

const mongoose = require("mongoose");

const branchManagerSchema = new mongoose.Schema(
    {
        refreshToken: {
            type: String,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        role: {
            type: String,
            enum: ["BRANCHMANAGER"],
            default: "BRANCHMANAGER",
        },
        status: {
            type: String,
            enum: ["ACTIVE", "SUSPENDED", "LOCKED"],
            default: "ACTIVE",
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Branch',
            required: true,
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false,
        },
        lastLoginAt: {
            type: Date,
        },
        passwordChangedAt: {
            type: Date,
        },
        failedLoginAttempts: {
            type: Number,
            default: 0,
        },
        lockUntil: {
            type: Date,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'creatorRole'
        },
        creatorRole: {
            type: String,
            required: true,
            enum: ['ADMIN', 'OPERATIONADMIN', 'FINANCEADMIN', 'COUNTRYMANAGER']
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                delete ret.passwordHash;
                delete ret.refreshToken;
                delete ret.failedLoginAttempts;
                delete ret.lockUntil;
                delete ret.__v;
                return ret;
            }
        },
        toObject: {
            transform(doc, ret) {
                delete ret.passwordHash;
                delete ret.refreshToken;
                delete ret.failedLoginAttempts;
                delete ret.lockUntil;
                delete ret.__v;
                return ret;
            }
        }
    }
);

branchManagerSchema.post(['find', 'findOne'], async function (docs) {
    if (!docs) return;

    // Map of role enum to actual mongoose model names
    const roleToModelMapping = {
        'ADMIN': 'Admin',
        'OPERATIONADMIN': 'OperationalAdmin',
        'FINANCEADMIN': 'FinanceAdmin',
        'COUNTRYMANAGER': 'CountryManager'
    };

    const processDoc = (doc) => {
        if (doc && doc.creatorRole && roleToModelMapping[doc.creatorRole]) {
            doc.creatorRole = roleToModelMapping[doc.creatorRole];
        }
    };

    if (Array.isArray(docs)) {
        docs.forEach(processDoc);
    } else {
        processDoc(docs);
    }
});

module.exports = mongoose.model("BranchManager", branchManagerSchema);

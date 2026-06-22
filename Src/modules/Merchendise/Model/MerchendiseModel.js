const mongoose = require("mongoose");

const merchendiseSchema = new mongoose.Schema(
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
            default: "MERCHENDISE",
            enum: ["MERCHENDISE"]
        },
        permissions: {
            type: [String],
            default: []
        },
        status: {
            type: String,
            enum: ["ACTIVE", "SUSPENDED", "LOCKED"],
            default: "ACTIVE",
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
        },
        isDeleted: {
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
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'creatorRole'
        },
        creatorRole: {
            type: String,
            enum: ['ADMIN', 'OPERATIONADMIN', 'FINANCEADMIN', 'COUNTRYMANAGER', 'BRANCHMANAGER', 'MERCHENDISE']
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

const Merchendise = mongoose.models.Merchendise || mongoose.model("Merchendise", merchendiseSchema);
if (!mongoose.models.MERCHENDISE) {
    mongoose.model("MERCHENDISE", merchendiseSchema, "merchendises");
}
module.exports = Merchendise;

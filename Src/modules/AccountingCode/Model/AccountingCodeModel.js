const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const accountingCodeSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            enum: ["INCOME", "EXPENSE", "LIABILITY", "ASSET", "EQUITY"],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: [
                ROLES.ADMIN,
                ROLES.FINANCEADMIN,
            ],
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Search indexes
accountingCodeSchema.index({ code: 1, isActive: 1, isDeleted: 1 });
accountingCodeSchema.index({ category: 1 });

module.exports = mongoose.model("AccountingCode", accountingCodeSchema);

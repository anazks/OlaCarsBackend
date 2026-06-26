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
            enum: [
                "Income", "Expense", "Cash", "Accounts Receivable", "Fixed Asset",
                "Other Current Asset", "Accounts Payable", "Other Current Liability", "Equity",
                "Other Expense", "Other Liability", "Stock", "Cost Of Goods Sold", "Output Tax",
                "Input Tax", "Bank", "Non Current Liability", "Other Income", "Other Asset",
                "INCOME", "EXPENSE", "LIABILITY", "ASSET", "EQUITY",
                "ncome", "non current liab"
            ],
        },
        accountType: {
            type: String,
            trim: true,
        },
        mileageRate: {
            type: Number,
            default: 0,
        },
        mileageUnit: {
            type: String,
            trim: true,
            default: "",
        },
        isMileage: {
            type: Boolean,
            default: false,
        },
        accountNumber: {
            type: String,
            trim: true,
        },
        accountStatus: {
            type: String,
            trim: true,
            default: "Active",
        },
        currency: {
            type: String,
            trim: true,
            default: "USD",
        },
        parentAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            default: null,
        },
        cuentaEspanol: {
            type: String,
            trim: true,
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
        debitTotal: {
            type: Number,
            default: 0,
        },
        creditTotal: {
            type: Number,
            default: 0,
        },
        currentBalance: {
            type: Number,
            default: 0,
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

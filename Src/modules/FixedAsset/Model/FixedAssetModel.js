const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const fixedAssetSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        purchaseDate: {
            type: Date,
            required: true,
        },
        purchasePrice: {
            type: Number,
            required: true,
            min: 0,
        },
        residualValue: {
            type: Number,
            default: 0,
            min: 0,
        },
        usefulLifeYears: {
            type: Number,
            required: true,
            min: 1,
        },
        location: {
            type: String,
            trim: true,
            default: "Head Office",
        },
        purchaseQuantity: {
            type: Number,
            default: 1,
        },
        serialNumber: {
            type: String,
            trim: true,
            default: "",
        },
        currentQuantity: {
            type: Number,
            default: 1,
        },
        currentValue: {
            type: Number,
            min: 0,
        },
        disposalValue: {
            type: Number,
            min: 0,
            default: 0,
        },
        warrantyExpirationDate: {
            type: Date,
        },
        fixedAssetType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FixedAssetType",
            required: false,
        },
        computationType: {
            type: String,
            trim: true,
            default: "Prorata Basis",
        },
        depreciationStartDate: {
            type: Date,
        },
        assetLife: {
            type: Number,
            default: 60,
        },
        assetLifeUnit: {
            type: String,
            enum: ["Months", "Years"],
            default: "Months",
        },
        notes: {
            type: String,
            trim: true,
            default: "",
        },
        depreciationMethod: {
            type: String,
            required: true,
            enum: ["Straight-Line"],
            default: "Straight-Line",
        },
        depreciationInterval: {
            type: String,
            required: true,
            enum: ["Monthly", "Yearly"],
            default: "Monthly",
        },
        status: {
            type: String,
            required: true,
            enum: ["Draft", "Pending", "Active", "Inactive"],
            default: "Draft",
        },
        fixedAssetAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
        },
        accumulatedDepreciationAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
        },
        depreciationExpenseAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
        },
        originalBill: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Bill",
            required: false,
        },
        originalPO: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PurchaseOrder",
            required: false,
        },
        linkedVehicle: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
            required: false,
        },
        depreciationSchedule: [
            {
                periodIndex: { type: Number, required: true },
                periodDate: { type: Date, required: true },
                depreciationAmount: { type: Number, required: true },
                accumulatedDepreciation: { type: Number, required: true },
                bookValue: { type: Number, required: true },
                status: { type: String, enum: ["Pending", "Posted"], default: "Pending" },
                ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerEntry", required: false },
                postedDate: { type: Date, required: false },
            }
        ],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: Object.values(ROLES),
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("FixedAsset", fixedAssetSchema);

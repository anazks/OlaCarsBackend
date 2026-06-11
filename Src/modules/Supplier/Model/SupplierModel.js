const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const supplierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        contactPerson: {
            type: String,
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
        },
        category: {
            type: String,
            enum: ["Vehicles", "Parts", "Spare Parts", "Services", "Insurance", "Office Supplies", "IT Equipment", "Marketing", "Other", "General"],
            default: "General",
        },
        vendorNumber: { type: String, trim: true },
        companyName: { type: String, trim: true },
        displayName: { type: String, trim: true },
        salutation: { type: String, trim: true },
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        mobilePhone: { type: String, trim: true },
        currencyCode: { type: String, trim: true, default: "USD" },
        notes: { type: String, trim: true },
        website: { type: String, trim: true },
        openingBalance: { type: Number, default: 0 },
        locationId: { type: String, trim: true },
        locationName: { type: String, trim: true },
        accountsPayable: { type: mongoose.Schema.Types.ObjectId, ref: "AccountingCode", default: null },
        paymentTermsLabel: { type: String, trim: true },
        paymentTerms: { type: String, trim: true },
        taxable: { type: Boolean, default: false },
        taxName: { type: String, trim: true },
        taxPercentage: { type: Number, default: 0 },
        taxType: { type: String, trim: true },
        contactAddressId: { type: String, trim: true },
        billingAttention: { type: String, trim: true },
        billingAddress: { type: String, trim: true },
        billingStreet2: { type: String, trim: true },
        billingCity: { type: String, trim: true },
        billingState: { type: String, trim: true },
        billingCountry: { type: String, trim: true },
        billingCode: { type: String, trim: true },
        billingPhone: { type: String, trim: true },
        billingFax: { type: String, trim: true },
        shippingAttention: { type: String, trim: true },
        shippingAddress: { type: String, trim: true },
        shippingStreet2: { type: String, trim: true },
        shippingCity: { type: String, trim: true },
        shippingState: { type: String, trim: true },
        shippingCountry: { type: String, trim: true },
        shippingCode: { type: String, trim: true },
        shippingPhone: { type: String, trim: true },
        shippingFax: { type: String, trim: true },
        source: { type: String, trim: true },
        primaryContactId: { type: String, trim: true },
        companyId: { type: String, trim: true },
        cfFleetNo: { type: String, trim: true },
        cfActiveDate: { type: Date },
        cfRuc: { type: String, trim: true },
        cfDv: { type: String, trim: true },
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
                ROLES.OPERATIONADMIN,
                ROLES.FINANCEADMIN,
                ROLES.COUNTRYMANAGER,
                ROLES.BRANCHMANAGER,
                ROLES.OPERATIONSTAFF,
                ROLES.FINANCESTAFF,
            ],
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Basic search index for active suppliers
supplierSchema.index({ name: 1, isActive: 1, isDeleted: 1 });

module.exports = mongoose.model("Supplier", supplierSchema);

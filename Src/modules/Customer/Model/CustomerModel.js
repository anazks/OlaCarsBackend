const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    customerId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: false
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    whatsappNumber: {
        type: String,
        trim: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },

    // ── Zoho-Extended Fields ─────────────────────────────────────────
    customerNumber: { type: String, trim: true },
    companyName: { type: String, trim: true },
    salutation: { type: String, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    mobilePhone: { type: String, trim: true },
    currencyCode: { type: String, trim: true, default: 'USD' },
    notes: { type: String, trim: true },
    website: { type: String, trim: true },
    openingBalance: { type: Number, default: 0 },
    openingBalanceExchangeRate: { type: Number },
    portalEnabled: { type: Boolean, default: false },
    creditLimit: { type: Number },
    customerSubType: { type: String, trim: true },
    paymentTerms: { type: String, trim: true },
    paymentTermsLabel: { type: String, trim: true },
    taxable: { type: Boolean, default: false },
    taxName: { type: String, trim: true },
    taxPercentage: { type: Number, default: 0 },
    taxType: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    priceList: { type: String, trim: true },
    accountsReceivable: { type: String, trim: true },
    locationId: { type: String, trim: true },
    locationName: { type: String, trim: true },
    bankAccountPayment: { type: String, trim: true },
    contactAddressId: { type: String, trim: true },
    companyId: { type: String, trim: true },
    primaryContactId: { type: String, trim: true },
    contactId: { type: String, trim: true },
    contactName: { type: String, trim: true },
    contactType: { type: String, trim: true },

    // ── Billing Address ──────────────────────────────────────────────
    billingAttention: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    billingStreet2: { type: String, trim: true },
    billingCity: { type: String, trim: true },
    billingState: { type: String, trim: true },
    billingCountry: { type: String, trim: true },
    billingCounty: { type: String, trim: true },
    billingCode: { type: String, trim: true },
    billingPhone: { type: String, trim: true },
    billingFax: { type: String, trim: true },
    billingLatitude: { type: String, trim: true },
    billingLongitude: { type: String, trim: true },

    // ── Shipping Address ─────────────────────────────────────────────
    shippingAttention: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    shippingStreet2: { type: String, trim: true },
    shippingCity: { type: String, trim: true },
    shippingState: { type: String, trim: true },
    shippingCountry: { type: String, trim: true },
    shippingCounty: { type: String, trim: true },
    shippingCode: { type: String, trim: true },
    shippingPhone: { type: String, trim: true },
    shippingFax: { type: String, trim: true },
    shippingLatitude: { type: String, trim: true },
    shippingLongitude: { type: String, trim: true },

    // ── Social ───────────────────────────────────────────────────────
    skypeIdentity: { type: String, trim: true },
    facebookUrl: { type: String, trim: true },
    twitterHandle: { type: String, trim: true },

    // ── Custom Fields (CF.*) ─────────────────────────────────────────
    cfFleetNo: { type: String, trim: true },
    cfActiveDate: { type: Date },
    cfVehicleNo: { type: String, trim: true },
    cfEndDate: { type: Date },
    cfSection: { type: String, trim: true },

    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE"
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'creatorRole',
        required: false
    },
    creatorRole: {
        type: String,
        required: false
    }
}, { timestamps: true });

customerSchema.index({ status: 1 });
customerSchema.index({ branch: 1 });
customerSchema.index({ driver: 1 });

module.exports = mongoose.model('Customer', customerSchema);

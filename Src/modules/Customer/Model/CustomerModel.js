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
customerSchema.index({ customerId: 1 });
customerSchema.index({ driver: 1 });

module.exports = mongoose.model('Customer', customerSchema);

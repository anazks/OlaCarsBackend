const mongoose = require('mongoose');

const EnquirySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    province: {
        type: String,
        required: false,
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['ENQUIRY', 'COMPLAINT'],
        default: 'ENQUIRY'
    },
    status: {
        type: String,
        enum: ['PENDING', 'RESOLVED', 'IN_PROGRESS'],
        default: 'PENDING'
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: false
    },
    response: {
        type: String,
        required: false
    },
    respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    respondedAt: {
        type: Date,
        required: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Enquiry', EnquirySchema);

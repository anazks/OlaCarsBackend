const mongoose = require('mongoose');

const EmailConfigSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    appPassword: {
        type: String,
        default: null
    },
    purpose: {
        type: String,
        enum: ['ESCALATION', 'GENERAL_ENQUIRY', 'COMPLAINT', 'OUTGOING', 'NONE'],
        default: 'NONE'
    },
    label: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Ensure only one email is assigned per major purpose
EmailConfigSchema.index({ purpose: 1 }, { 
    unique: true, 
    partialFilterExpression: { purpose: { $ne: 'NONE' } } 
});

const EmailConfigModel = mongoose.model('EmailConfig', EmailConfigSchema);
module.exports = EmailConfigModel;

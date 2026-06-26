const mongoose = require('mongoose');

const fleetSchema = new mongoose.Schema(
    {
        fleetNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        assignedStaff: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'assignedStaffModel'
        },
        assignedStaffModel: {
            type: String,
            required: true,
            enum: ['OperationStaff', 'FinanceStaff']
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Branch',
            required: true
        },
        description: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE'],
            default: 'ACTIVE'
        },
        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// Performance indexes
fleetSchema.index({ fleetNumber: 1 });
fleetSchema.index({ assignedStaff: 1 });
fleetSchema.index({ branchId: 1 });

module.exports = mongoose.model('Fleet', fleetSchema);


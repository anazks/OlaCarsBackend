const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const purchaseOrderSchema = new mongoose.Schema(
    {
        purchaseOrderNumber: {
            type: String,
            required: true,
            unique: true,
        },
        officialPONumber: {
            type: String,
        },
        status: {
            type: String,
            enum: [
                "REQUESTED", 
                "MANAGER_APPROVED", 
                "WAITING", 
                "REVISION_REQUESTED", 
                "REVISION_APPROVED", 
                "PENDING_FINANCE_APPROVAL", 
                "APPROVED", 
                "PO_ISSUED", 
                "REJECTED", 
                "DISPOSED", 
                "RECEIVED"
            ],
            default: "WAITING",
        },
        purpose: {
            type: String,
            enum: ["Vehicle", "Spare Parts", "Others"],
            default: "Others",
            required: true,
        },
        items: [
            {
                itemName: { type: String, required: true },
                quantity: { type: Number, required: true, default: 1 },
                description: { type: String },
                unitPrice: { type: Number, required: true },
                accountId: { type: mongoose.Schema.Types.ObjectId, ref: "AccountingCode" },
                merchandiserPrice: { type: Number },
                prAllocations: [
                    {
                        prId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopProcurement" },
                        prNumber: { type: String },
                        allocatedQuantity: { type: Number, default: 0 },
                        originalPRQuantity: { type: Number }
                    }
                ],
                images: {
                    type: [String],
                    validate: {
                        validator: function (v) {
                            return v.length <= 8;
                        },
                        message: props => `${props.path} exceeds the limit of 8 images.`
                    },
                    default: []
                }
            }
        ],
        linkedPRs: [
            {
                prId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopProcurement" },
                prNumber: { type: String },
                allocatedQuantity: { type: Number, default: 0 },
                originalPRQuantity: { type: Number }
            }
        ],
        totalAmount: {
            type: Number,
            required: true,
        },
        merchandiserTotalAmount: {
            type: Number,
        },
        originalTotalAmount: {
            type: Number,
        },
        documents: {
            type: [String],
            default: [],
        },
        rejectionNote: {
            type: String,
        },
        approvalNote: {
            type: String,
        },
        revisionReason: {
            type: String,
        },
        revisionDecisionNote: {
            type: String,
        },
        isRevisionAllowed: {
            type: Boolean,
            default: false,
        },
        deliveryDate: {
            type: Date,
        },
        paymentTerms: {
            type: String,
        },
        shippingTerms: {
            type: String,
        },
        description: {
            type: String,
        },
        notes: {
            type: String,
        },
        purchaseOrderDate: {
            type: Date,
            default: Date.now,
        },
        paymentDate: {
            type: Date,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
        },
        supplierDetails: {
            name: { type: String },
            email: { type: String },
            phone: { type: String },
            address: { type: String },
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.MERCHENDISE],
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "approverRole",
        },
        approverRole: {
            type: String,
            enum: [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER],
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        isUsed: {
            type: Boolean,
            default: false,
        },
        isBilled: {
            type: Boolean,
            default: false,
        },
        editHistory: [
            {
                editedAt: { type: Date, default: Date.now },
                editedBy: { type: mongoose.Schema.Types.ObjectId },
                editorRole: { type: String },
                editorName: { type: String },
                action: { type: String },
                previousStatus: { type: String },
                newStatus: { type: String },
                changesSummary: { type: String },
                notes: { type: String },
            }
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
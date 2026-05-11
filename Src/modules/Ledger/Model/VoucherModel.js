const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const voucherSchema = new mongoose.Schema(
    {
        voucherNumber: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        type: {
            type: String,
            enum: ["SALES", "PURCHASE", "RECEIPT", "PAYMENT", "JOURNAL", "CONTRA"],
            required: true,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        narration: {
            type: String,
            required: true,
            trim: true,
        },
        referenceInfo: {
            referenceNumber: { type: String, trim: true }, // Invoice #, cheque #, etc.
            partyName: { type: String, trim: true },
            partyId: { type: String, trim: true }, // External ID if applicable
            partyType: { type: String, enum: ["CUSTOMER", "SUPPLIER", "DRIVER", "OTHER"], default: "OTHER" }
        },
        lines: [
            {
                accountingCode: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "AccountingCode",
                    required: true,
                },
                type: {
                    type: String,
                    required: true,
                    enum: ["CREDIT", "DEBIT"],
                },
                amount: {
                    type: Number,
                    required: true,
                    min: 0,
                },
                description: {
                    type: String,
                    trim: true,
                },
                taxInfo: {
                    taxApplied: { type: mongoose.Schema.Types.ObjectId, ref: "Tax" },
                    taxAmount: { type: Number, default: 0 },
                    isTaxInclusive: { type: Boolean, default: false },
                },
            }
        ],
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ["DRAFT", "POSTED", "CANCELLED"],
            default: "DRAFT",
        },
        // Audit Trail
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
        postedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "postedByRole",
        },
        postedByRole: {
            type: String,
            enum: Object.values(ROLES),
        },
        postedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Auto-generate voucher number before validation if not provided
voucherSchema.pre("validate", async function () {
    if (!this.voucherNumber) {
        const count = await this.constructor.countDocuments({ type: this.type });
        const prefixMap = {
            SALES: "SV",
            PURCHASE: "PV",
            RECEIPT: "RV",
            PAYMENT: "PMT",
            JOURNAL: "JV",
            CONTRA: "CN"
        };
        const prefix = prefixMap[this.type] || "VCH";
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        this.voucherNumber = `${prefix}-${dateStr}-${(count + 1).toString().padStart(4, "0")}`;
    }
});

voucherSchema.index({ voucherNumber: 1 });
voucherSchema.index({ branch: 1 });
voucherSchema.index({ type: 1 });
voucherSchema.index({ status: 1 });
voucherSchema.index({ date: 1 });

module.exports = mongoose.model("Voucher", voucherSchema);

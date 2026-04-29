const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const manualJournalSchema = new mongoose.Schema(
    {
        journalNumber: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        paymentMethod: {
            type: String,
            enum: ["CASH", "BANK"],
            default: "CASH",
        },
        bankAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BankAccount",
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

// Auto-generate journal number before saving
manualJournalSchema.pre("validate", async function () {
    if (!this.journalNumber) {
        const count = await this.constructor.countDocuments();
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        this.journalNumber = `JV-${dateStr}-${(count + 1).toString().padStart(4, "0")}`;
    }
});

// manualJournalSchema.index({ journalNumber: 1 }); // Already unique: true
manualJournalSchema.index({ branch: 1 });
manualJournalSchema.index({ status: 1 });
manualJournalSchema.index({ date: 1 });

module.exports = mongoose.model("ManualJournal", manualJournalSchema);

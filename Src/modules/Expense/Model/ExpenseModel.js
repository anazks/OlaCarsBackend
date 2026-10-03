const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
    {
        expenseNumber: {
            type: String,
            required: true,
            unique: true,
        },
        expenseAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
        },
        paidThroughAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        expenseDate: {
            type: Date,
            default: Date.now,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: false,
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: false,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        notes: {
            type: String,
        },
        attachments: [{
            url: { type: String, trim: true },
            name: { type: String, trim: true },
            originalName: { type: String, trim: true },
            fileType: { type: String, trim: true },
            size: { type: Number },
            uploadedAt: { type: Date, default: Date.now }
        }],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);

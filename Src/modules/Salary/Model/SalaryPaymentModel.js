const mongoose = require("mongoose");

const salaryPaymentSchema = new mongoose.Schema(
    {
        staffId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "staffRole",
        },
        staffRole: {
            type: String,
            required: true,
        },
        month: {
            type: Number, // 1-12
            required: true,
        },
        year: {
            type: Number,
            required: true,
        },
        baseSalary: Number,
        totalAllowances: Number,
        totalBonuses: Number,
        totalDeductions: Number,
        leaveDeduction: {
            type: Number,
            default: 0
        },
        netSalary: {
            type: Number,
            required: true,
        },
        ledgerEntry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LedgerEntry",
        },
        status: {
            type: String,
            enum: ["PENDING", "PAID"],
            default: "PAID",
        },
        paidAt: {
            type: Date,
            default: Date.now,
        },
        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "processorRole",
        },
        processorRole: {
            type: String,
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("SalaryPayment", salaryPaymentSchema);

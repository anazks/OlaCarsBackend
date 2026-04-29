const mongoose = require("mongoose");

const salaryStructureSchema = new mongoose.Schema(
    {
        staffId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "staffRole",
        },
        staffRole: {
            type: String,
            required: true,
            enum: [
                "OPERATIONADMIN",
                "FINANCEADMIN",
                "COUNTRYMANAGER",
                "BRANCHMANAGER",
                "OPERATIONSTAFF",
                "FINANCESTAFF",
                "WORKSHOPMANAGER",
                "WORKSHOPSTAFF",
            ],
        },
        baseSalary: {
            type: Number,
            required: true,
            default: 0,
        },
        allowances: [
            {
                name: { type: String, required: true },
                amount: { type: Number, required: true, default: 0 },
            }
        ],
        bonuses: [
            {
                name: { type: String, required: true },
                amount: { type: Number, required: true, default: 0 },
            }
        ],
        deductions: [
            {
                name: { type: String, required: true },
                amount: { type: Number, required: true, default: 0 },
            }
        ],
        currency: {
            type: String,
            default: "USD",
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("SalaryStructure", salaryStructureSchema);

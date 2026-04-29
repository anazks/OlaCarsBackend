const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
    {
        bankName: {
            type: String,
            required: true,
            trim: true,
        },
        accountNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        accountHolderName: {
            type: String,
            required: true,
            trim: true,
        },
        swiftCode: {
            type: String,
            trim: true,
        },
        ifscCode: {
            type: String,
            trim: true,
        },
        branchName: {
            type: String,
            trim: true,
        },
        currency: {
            type: String,
            default: "USD",
            uppercase: true,
        },
        initialBalance: {
            type: Number,
            default: 0,
        },
        currentBalance: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

bankAccountSchema.pre("save", async function () {
    if (this.isNew) {
        console.log("[BankAccountModel] Initializing balance for new account:", this.accountNumber);
        this.currentBalance = this.initialBalance || 0;
    }
});

module.exports = mongoose.models.BankAccount || mongoose.model("BankAccount", bankAccountSchema);

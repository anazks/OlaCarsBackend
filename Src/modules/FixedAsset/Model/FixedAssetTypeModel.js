const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const fixedAssetTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
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
    },
    { timestamps: true }
);

module.exports = mongoose.model("FixedAssetType", fixedAssetTypeSchema);

const mongoose = require("mongoose");

const TASK_CATEGORIES = ["Mechanical", "Electrical", "Body", "Tyres", "Fluids", "Other"];

const WORK_ORDER_TYPES = [
    "PREVENTIVE", "CORRECTIVE", "PRE_ENTRY", "ACCIDENT",
    "RETURN_INSPECTION", "RECALL", "SAFETY_PREP", "WEAR_ITEM", "OTHER",
];

const linkedPartSchema = new mongoose.Schema({
    inventoryPartId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryPart", required: true },
    partName: { type: String, required: true },
    partNumber: { type: String, required: true },
    defaultQuantity: { type: Number, default: 1, min: 1 },
}, { _id: false });

const taskTemplateSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, uppercase: true },
        description: { type: String, trim: true },
        category: { type: String, enum: TASK_CATEGORIES, required: true },
        estimatedHours: { type: Number, default: 0.5, min: 0 },
        workOrderTypes: [{ type: String, enum: WORK_ORDER_TYPES }],
        linkedParts: [linkedPartSchema],
        isActive: { type: Boolean, default: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
        creatorRole: { type: String, required: true },
    },
    { timestamps: true }
);

taskTemplateSchema.index({ branchId: 1, isActive: 1 });
taskTemplateSchema.index({ workOrderTypes: 1 });
taskTemplateSchema.index({ name: 1, branchId: 1 });

module.exports = {
    TaskTemplate: mongoose.model("TaskTemplate", taskTemplateSchema),
    TASK_CATEGORIES,
};

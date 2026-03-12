const mongoose = require("mongoose");

const PART_CATEGORIES = [
    "Engine",
    "Transmission",
    "Brakes",
    "Suspension",
    "Electrical",
    "Body",
    "Tyres",
    "Fluids",
    "Filters",
    "Belts",
    "Cooling",
    "Exhaust",
    "Interior",
    "Other",
];

const UNITS = ["piece", "litre", "kg", "metre", "set", "pair", "box"];

const inventoryPartSchema = new mongoose.Schema(
    {
        partName: { type: String, required: true, trim: true },
        partNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
        category: { type: String, enum: PART_CATEGORIES, required: true },
        description: { type: String },

        // Stock
        unit: { type: String, enum: UNITS, default: "piece" },
        unitCost: { type: Number, required: true, min: 0 },
        quantityOnHand: { type: Number, default: 0, min: 0 },
        quantityReserved: { type: Number, default: 0, min: 0 },
        reorderLevel: { type: Number, default: 5 },

        // Location
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },

        // Supplier
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
        supplierPartNumber: { type: String },
        leadTimeDays: { type: Number, default: 7 },

        // Tracking
        lastRestockedAt: { type: Date },
        isActive: { type: Boolean, default: true },

        // Audit
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "creatorRole" },
        creatorRole: { type: String, required: true },
    },
    { timestamps: true }
);

// Virtual: available = onHand - reserved
inventoryPartSchema.virtual("quantityAvailable").get(function () {
    return this.quantityOnHand - this.quantityReserved;
});

// Virtual: is low stock
inventoryPartSchema.virtual("isLowStock").get(function () {
    return this.quantityOnHand <= this.reorderLevel;
});

inventoryPartSchema.set("toJSON", { virtuals: true });
inventoryPartSchema.set("toObject", { virtuals: true });

// Indexes
inventoryPartSchema.index({ branchId: 1 });
inventoryPartSchema.index({ category: 1 });
inventoryPartSchema.index({ branchId: 1, quantityOnHand: 1 }); // low stock queries

module.exports = {
    InventoryPart: mongoose.model("InventoryPart", inventoryPartSchema),
    PART_CATEGORIES,
    UNITS,
};

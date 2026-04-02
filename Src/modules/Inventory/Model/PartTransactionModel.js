const mongoose = require("mongoose");

const TRANSACTION_TYPES = [
    "RESTOCK",        // Adding stock from supplier
    "RESERVE",        // Reserving for a work order
    "RELEASE",        // Releasing reservation (cancellation)
    "INSTALL",        // Physically installed (onHand and reserved decrease)
    "ADJUSTMENT",     // Manual correction
    "RETURN",         // Returned to stock from work order
];

const partTransactionSchema = new mongoose.Schema(
    {
        partId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryPart", required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
        workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder" },
        
        transactionType: {
            type: String,
            enum: TRANSACTION_TYPES,
            required: true,
        },
        
        quantity: { type: Number, required: true }, // can be positive or negative depending on type
        
        performedBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "role" },
        role: { type: String, required: true },
        
        notes: { type: String },
    },
    { timestamps: true }
);

// Indexes
partTransactionSchema.index({ partId: 1, createdAt: -1 });
partTransactionSchema.index({ branchId: 1, createdAt: -1 });
partTransactionSchema.index({ workOrderId: 1 });

module.exports = {
    PartTransaction: mongoose.model("PartTransaction", partTransactionSchema),
    TRANSACTION_TYPES,
};

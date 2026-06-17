const mongoose = require("mongoose");

const DashboardSummarySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null, // null means global/unspecified
    },
    country: {
      type: String,
      trim: true,
      default: null,
    },
    metrics: {
      revenue: { type: Number, default: 0 },
      outstandingCollections: { type: Number, default: 0 },
      payables: { type: Number, default: 0 },
      activeVehicles: { type: Number, default: 0 },
      activeDrivers: { type: Number, default: 0 },
      totalPayables: { type: Number, default: 0 },
      lastMonthBalanceDue: { type: Number, default: 0 },
      alerts: {
        CRITICAL: { type: Number, default: 0 },
        MAJOR: { type: Number, default: 0 },
        MINOR: { type: Number, default: 0 },
      },
      fleetStatus: {
        available: { type: Number, default: 0 },
        rented: { type: Number, default: 0 },
        maintenance: { type: Number, default: 0 },
        retired: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
      vehicleMovement: {
        removed: { type: Number, default: 0 },
        returned: { type: Number, default: 0 },
        sale: { type: Number, default: 0 },
      },
      workshop: {
        createdWorkOrders: { type: Number, default: 0 },
        completedWorkOrders: { type: Number, default: 0 },
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Unique index on date and branch to prevent duplicates
DashboardSummarySchema.index({ date: 1, branch: 1 }, { unique: true });
DashboardSummarySchema.index({ country: 1 });

module.exports = mongoose.model("DashboardSummary", DashboardSummarySchema);

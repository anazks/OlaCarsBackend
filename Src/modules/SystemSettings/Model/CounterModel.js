const mongoose = require("mongoose");

// ─── Generic Counter Collection ──────────────────────────────────────
// Stores auto-incrementing sequence values for various entities.
// Usage:  const nextId = await getNextDriverId();  → "OLA-000001"
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },   // e.g. "driverId"
    seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

/**
 * Atomically increment and return the next sequence number for a given counter.
 * Creates the counter document on first call (upsert).
 * @param {string} name - Counter identifier (e.g. "driverId")
 * @returns {Promise<number>} The next sequence number
 */
async function getNextSequence(name) {
    const result = await Counter.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return result.seq;
}

/**
 * Generate the next Driver ID in OLA-XXXXXX format.
 * Thread-safe via MongoDB atomic $inc.
 * @returns {Promise<string>} e.g. "OLA-000001"
 */
async function getNextDriverId() {
    const seq = await getNextSequence("driverId");
    return `OLA-${String(seq).padStart(6, "0")}`;
}

module.exports = { Counter, getNextSequence, getNextDriverId };

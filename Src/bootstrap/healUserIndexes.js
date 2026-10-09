const mongoose = require("mongoose");

const USER_COLLECTIONS = [
  "admins",
  "financeadmins",
  "financestaffs",
  "operationadmins",
  "operationstaffs",
  "branchmanagers",
  "countrymanagers",
  "merchendises",
  "workshopmanagers",
  "workshopstaffs"
];

/**
 * Ensures user collections use a partial unique index on email
 * where isDeleted is false, so soft-deleted users do not cause
 * E11000 duplicate key errors when re-creating users with the same email.
 */
async function healUserIndexes() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    for (const collName of USER_COLLECTIONS) {
      try {
        const collections = await db.listCollections({ name: collName }).toArray();
        if (collections.length === 0) continue;

        const indexes = await db.collection(collName).indexes();
        const emailIndex = indexes.find((idx) => idx.name === "email_1");

        // If email_1 exists and does NOT have partialFilterExpression on isDeleted: false
        if (
          emailIndex &&
          (!emailIndex.partialFilterExpression ||
            emailIndex.partialFilterExpression.isDeleted !== false)
        ) {
          console.log(`[Index Migration] Dropping legacy email_1 index on collection: ${collName}`);
          await db.collection(collName).dropIndex("email_1");

          console.log(
            `[Index Migration] Creating partial unique email index on collection: ${collName}`
          );
          await db.collection(collName).createIndex(
            { email: 1 },
            { unique: true, partialFilterExpression: { isDeleted: false } }
          );
        }
      } catch (err) {
        console.warn(`[Index Migration] Notice for ${collName}:`, err.message);
      }
    }
  } catch (error) {
    console.error("[Index Migration] healUserIndexes error:", error.message);
  }
}

module.exports = { healUserIndexes };

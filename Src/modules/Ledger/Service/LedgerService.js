const { addLedgerEntryService, getLedgerEntriesService } = require("../Repo/LedgerRepo");
const filterBody = require('../../../shared/utils/filterBody.js');

const ALLOWED_CREATE_FIELDS = ['transaction', 'accountingCode', 'type', 'amount', 'description', 'entryDate'];

/**
 * Creates a ledger entry with field whitelisting.
 */
exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    return await addLedgerEntryService(filtered);
};

/**
 * Retrieves all ledger entries.
 */
exports.getAll = async (query = {}) => {
    return await getLedgerEntriesService(query);
};

/**
 * Automatically generates a Ledger Entry from a completed PaymentTransaction.
 * This ensures immutable double-entry style tracking.
 */
exports.autoGenerateLedgerEntry = async (paymentTransaction) => {
    try {
        // Construct standard description showing context
        const description = `Payment [${paymentTransaction.transactionType}] for ${paymentTransaction.referenceModel} (${paymentTransaction.referenceId}). Notes: ${paymentTransaction.notes || "None"}.`;

        const ledgerData = {
            transaction: paymentTransaction._id,
            accountingCode: paymentTransaction.accountingCode,
            type: paymentTransaction.transactionType, // Mirrors the DEBIT/CREDIT set by the user
            amount: paymentTransaction.totalAmount, // Maps exact amount
            description: description,
            entryDate: paymentTransaction.paymentDate || new Date(),
        };

        await addLedgerEntryService(ledgerData);
        // Note: In full double-entry, a second inverse record (e.g. against Cash/Bank code) is usually made here.
        // For current scope, we log the primary category selected by the user.

    } catch (error) {
        console.error("Failed to generate ledger entry:", error);
        // Do not throw to crash the main request - in real production, push to a Dead Letter Queue to retry.
    }
};

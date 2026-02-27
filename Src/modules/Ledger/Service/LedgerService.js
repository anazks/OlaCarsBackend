const { addLedgerEntryService } = require("../Repo/LedgerRepo");

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

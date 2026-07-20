const { createManualJournalRepo } = require("../Repo/ManualJournalRepo");
const { create: createLedgerEntry } = require("./LedgerService");
const AppError = require("../../../shared/utils/AppError");

/**
 * Creates a Manual Journal and its associated Ledger Entries.
 * Data format: {
 *   description: string,
 *   date: date,
 *   branch: string,
 *   lines: [
 *     { accountingCode: string, type: 'DEBIT'|'CREDIT', amount: number, description: string, taxInfo: {} }
 *   ],
 *   createdBy: string,
 *   creatorRole: string
 * }
 */
exports.createManualJournal = async (data) => {
    const { lines, ...journalData } = data;

    // Single-entry mode: No balance validation required
    let totalDebit = 0;
    lines.forEach(line => {
        if (line.type === "DEBIT") totalDebit += line.amount;
    });

    // 1. Create Journal Header
    const journal = await createManualJournalRepo({
        ...journalData,
        totalAmount: totalDebit,
        status: "POSTED" // Auto-post for now as requested
    });

    // 2. Create Ledger Entries for each line
    const ledgerEntries = [];
    for (const line of lines) {
        // Sanitize optional fields to avoid mongoose BSON/ObjectId cast errors
        const sanitizedLine = { ...line };
        if (sanitizedLine.contact === "") {
            delete sanitizedLine.contact;
        } else if (sanitizedLine.contact && !sanitizedLine.contactModel) {
            sanitizedLine.contactModel = "Customer";
        }
        if (sanitizedLine.transactionType === "") {
            delete sanitizedLine.transactionType;
        }
        if (sanitizedLine.taxInfo) {
            if (sanitizedLine.taxInfo.taxApplied === "") {
                delete sanitizedLine.taxInfo;
            } else {
                sanitizedLine.taxInfo = {
                    taxApplied: sanitizedLine.taxInfo.taxApplied
                };
            }
        }

        const entry = await createLedgerEntry({
            ...sanitizedLine,
            description: sanitizedLine.description || journalData.description, // Ensure description is never empty
            manualJournal: journal._id,
            branch: journalData.branch,
            entryDate: journalData.date || new Date(),
            createdBy: journalData.createdBy,
            creatorRole: journalData.creatorRole
        });
        ledgerEntries.push(entry);
    }

    return { journal, ledgerEntries };
};

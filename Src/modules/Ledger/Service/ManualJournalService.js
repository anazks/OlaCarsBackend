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
        const entry = await createLedgerEntry({
            ...line,
            description: line.description || journalData.description, // Ensure description is never empty
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

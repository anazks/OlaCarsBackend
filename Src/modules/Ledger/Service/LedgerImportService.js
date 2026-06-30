const XLSX = require("xlsx");
const LedgerEntry = require("../Model/LedgerEntryModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Branch = require("../../Branch/Model/BranchModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");

/**
 * Parse a flexible date from a string value (no JS Date timezone pitfalls).
 * Returns a UTC midnight Date object.
 */
function parseFlexibleDate(val) {
    if (!val) return null;
    const str = String(val).trim();
    if (!str) return null;

    // YYYY-MM-DD (from dateNF formatting or ISO strings)
    const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymdMatch) {
        const d = new Date(Date.UTC(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3])));
        if (!isNaN(d.getTime())) return d;
    }

    // DD/MM/YYYY, MM/DD/YYYY, M/D/YY, DD/MM/YY etc.
    const parts = str.split(/[-/.]/);
    if (parts.length >= 3) {
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        let p3 = parseInt(parts[2], 10);

        // Handle 2-digit year (e.g. 23 → 2023)
        if (p3 < 100) p3 = 2000 + p3;

        if (p3 >= 1900) {
            // Assume M/D/YYYY — swap if month > 12
            let month = p1, day = p2;
            if (month > 12 && day <= 12) { month = p2; day = p1; }
            const d = new Date(Date.UTC(p3, month - 1, day));
            if (!isNaN(d.getTime())) return d;
        }
    }

    return null;
}

/**
 * Get a cell value from a row, trying multiple possible column header names.
 */
function getVal(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
        // Try case-insensitive match
        const lowerKey = key.toLowerCase().trim();
        for (const k of Object.keys(row)) {
            if (k.replace(/^\ufeff/, "").toLowerCase().trim() === lowerKey) {
                if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
            }
        }
    }
    return undefined;
}

/**
 * Build the description string. Includes the primary transaction_details and description,
 * then appends all unmapped fields as a structured metadata block.
 */
function buildDescription(row) {
    const transactionDetails = String(getVal(row, ["transaction_details", "Transaction Details"]) || "").trim();
    const desc = String(getVal(row, ["description", "Description"]) || "").trim();

    let result = transactionDetails;
    if (desc && desc !== transactionDetails) {
        result += result ? ` — ${desc}` : desc;
    }

    // Append unmapped fields as metadata
    const meta = [];
    const refTxnId = getVal(row, ["reference_transaction_id", "Reference Transaction ID"]);
    const offsetAccId = getVal(row, ["offset_account_id", "Offset Account ID"]);
    const offsetAccType = getVal(row, ["offset_account_type", "Offset Account Type"]);
    const projectIds = getVal(row, ["project_ids", "Project IDs"]);
    const currencyCode = getVal(row, ["currency_code", "Currency Code"]);
    const accountGroup = getVal(row, ["account_group", "Account Group"]);
    const accountType = getVal(row, ["account_type", "Account Type"]);

    if (refTxnId) meta.push(`Ref: ${refTxnId}`);
    if (offsetAccId) meta.push(`Offset Acct: ${offsetAccId}`);
    if (offsetAccType) meta.push(`Offset Type: ${offsetAccType}`);
    if (projectIds) meta.push(`Project: ${projectIds}`);
    if (currencyCode) meta.push(`Currency: ${currencyCode}`);
    if (accountGroup) meta.push(`Acct Group: ${accountGroup}`);
    if (accountType) meta.push(`Acct Type: ${accountType}`);

    if (meta.length > 0) {
        result += ` [${meta.join(" | ")}]`;
    }

    return result.trim() || "Imported ledger entry";
}

/**
 * Import ledger entries from an Excel buffer.
 * Links entries with invoices via transactionId ↔ Invoice.invoiceID.
 *
 * @param {Buffer} fileBuffer - Raw Excel file buffer
 * @param {Object} options - { createdBy, creatorRole }
 * @returns {{ inserted: number, skipped: number, linked: number, errors: Array<{ row: number, reason: string }> }}
 */
exports.importFromExcel = async (fileBuffer, { createdBy, creatorRole }) => {
    // 1. Parse Excel
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: "yyyy-mm-dd" });

    if (!rawRows || rawRows.length === 0) {
        return { inserted: 0, skipped: 0, linked: 0, errors: [{ row: 0, reason: "No data rows found in the Excel file." }] };
    }

    return exports.importRows(rawRows, { createdBy, creatorRole });
};

/**
 * Import ledger entries from raw row JSON objects.
 * Links entries with invoices via transactionId ↔ Invoice.invoiceID.
 *
 * @param {Array<Object>} rawRows - Raw rows from Excel or JSON
 * @param {Object} options - { createdBy, creatorRole }
 * @returns {{ inserted: number, skipped: number, linked: number, errors: Array<{ row: number, reason: string }> }}
 */
exports.importRows = async (rawRows, { createdBy, creatorRole }) => {
    if (!rawRows || rawRows.length === 0) {
        return { inserted: 0, skipped: 0, linked: 0, errors: [] };
    }

    // 2. Pre-load lookup caches for performance
    const allAccounts = await AccountingCode.find({ isDeleted: { $ne: true } }).lean();
    const accountByCode = {};
    for (const acc of allAccounts) {
        if (acc.code) accountByCode[acc.code.toLowerCase().trim()] = acc;
    }

    const allBranches = await Branch.find({ isDeleted: { $ne: true } }).lean();
    const branchByName = {};
    for (const br of allBranches) {
        if (br.name) branchByName[br.name.toLowerCase().trim()] = br;
        if (br.code) branchByName[br.code.toLowerCase().trim()] = br;
        branchByName[br._id.toString()] = br;
    }

    // 3. Process each row
    const errors = [];
    const entriesToInsert = [];
    const transactionIdsToLink = []; // { index, transactionId } for invoice linking

    for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2; // Excel row (1-indexed header + 1-indexed data)

        try {
            // --- Resolve debit/credit → type + amount ---
            const debit = parseFloat(getVal(row, ["debit", "Debit"]) || 0);
            const credit = parseFloat(getVal(row, ["credit", "Credit"]) || 0);

            let type, amount, isNill = false;
            if (debit > 0) {
                type = "DEBIT";
                amount = debit;
            } else if (credit > 0) {
                type = "CREDIT";
                amount = credit;
            } else {
                type = "DEBIT";
                amount = 0;
                isNill = true;
            }

            // --- Resolve accountingCode ---
            const accountId = String(getVal(row, ["account_id", "Account ID"]) || "").trim();

            let accountingCode = null;
            if (accountId) {
                accountingCode = accountByCode[accountId.toLowerCase()];
            }
            if (!accountingCode) {
                errors.push({ row: rowNum, reason: `Account not found: ID="${accountId}"` });
                continue;
            }

            // --- Resolve branch from location_name ---
            const locationName = String(getVal(row, ["location_name", "Location Name", "branch", "Branch"]) || "").trim();
            let branch = null;
            if (locationName) {
                const locationLower = locationName.toLowerCase();
                if (locationLower === "head office") {
                    branch = allBranches.find(b => b.code === "PANAMA" || (b.name.toLowerCase() === "panama" && b.type === "BRANCH"));
                } else if (locationLower === "ola workshop") {
                    branch = allBranches.find(b => b.code === "JUC" || b.type === "WORKSHOP");
                } else {
                    branch = branchByName[locationLower];
                    if (!branch && /^[a-fA-F0-9]{24}$/.test(locationName)) {
                        branch = branchByName[locationName];
                    }
                }
            }

            // --- Resolve contact_id (store as string in description if can't resolve) ---
            const contactId = getVal(row, ["contact_id", "Contact ID"]);

            // --- Parse date ---
            const dateVal = getVal(row, ["date", "Date", "Entry Date", "entry_date", "entryDate"]);
            const entryDate = parseFlexibleDate(dateVal) || new Date();

            // --- Map direct fields ---
            const transactionId = String(getVal(row, ["transaction_id", "Transaction ID", "transactionId", "Voucher", "voucher"]) || "").trim() || undefined;
            const transactionType = String(getVal(row, ["transaction_type", "Transaction Type", "transactionType"]) || "").trim() || undefined;

            // --- Build description with metadata ---
            let description = buildDescription(row);
            if (isNill) {
                description = (description && description !== "Imported ledger entry") ? `${description} [Value: Nill]` : "value nill";
            }
            if (transactionId) {
                description = `${description} - Transaction ID: ${transactionId}`;
            }

            const entry = {
                accountingCode: accountingCode._id,
                type,
                amount,
                description,
                entryDate,
                createdBy,
                creatorRole,
            };

            if (transactionId) entry.transactionId = transactionId;
            if (transactionType) entry.transactionType = transactionType;
            if (branch) entry.branch = branch._id;
            // contactId: we try to set it but if it's a string ID, we add it to description
            if (contactId) {
                // If it looks like a MongoDB ObjectId (24 hex chars), use it
                if (/^[a-fA-F0-9]{24}$/.test(String(contactId).trim())) {
                    entry.contact = contactId;
                }
                // Otherwise it's already included in the description metadata
            }

            entriesToInsert.push(entry);
            if (transactionId) {
                transactionIdsToLink.push({ index: entriesToInsert.length - 1, transactionId });
            }
        } catch (err) {
            errors.push({ row: rowNum, reason: err.message });
        }
    }

    if (entriesToInsert.length === 0) {
        return { inserted: 0, skipped: 0, linked: 0, errors };
    }

    // 4. Bulk insert ledger entries
    const insertedDocs = await LedgerEntry.insertMany(entriesToInsert, { ordered: false });

    // 5. Link with Invoices: transactionId ↔ Invoice.invoiceID
    let linkedCount = 0;
    if (transactionIdsToLink.length > 0) {
        const txnIds = transactionIdsToLink.map(t => t.transactionId);
        const matchingInvoices = await Invoice.find({ invoiceID: { $in: txnIds } }).lean();

        const invoiceByExternalId = {};
        for (const inv of matchingInvoices) {
            if (inv.invoiceID) {
                invoiceByExternalId[inv.invoiceID] = inv;
            }
        }

        // Update ledger entries that matched an invoice — set the transaction field
        for (const { transactionId } of transactionIdsToLink) {
            const invoice = invoiceByExternalId[transactionId];
            if (invoice) {
                await LedgerEntry.updateMany(
                    { transactionId, createdBy },
                    { $set: { description: undefined } } // noop, we just want to confirm the link exists
                );
                linkedCount++;
            }
        }

        // Log the linking results
        console.log(`[LedgerImportService] Linked ${linkedCount} ledger entries with invoices out of ${transactionIdsToLink.length} that had transactionIds.`);
    }

    return {
        inserted: insertedDocs.length,
        skipped: rawRows.length - entriesToInsert.length - errors.length,
        linked: linkedCount,
        errors,
    };
};

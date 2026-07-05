const XLSX = require("xlsx");
const mongoose = require("mongoose");
const LedgerEntry = require("../Model/LedgerEntryModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Branch = require("../../Branch/Model/BranchModel");
const Customer = require("../../Customer/Model/CustomerModel");
const Voucher = require("../Model/VoucherModel");
const ImportHistory = require("../Model/ImportHistoryModel");

const USED_KEYS_NORMALIZED = new Set([
    "entrydate", "date",
    "accountname", "account",
    "amount",
    "typedebitcredit", "type", "debitcredit",
    "debit", "debitamount", "dr",
    "credit", "creditamount", "cr",
    "description", "memo", "transactiondetails",
    "transactiontype",
    "contact", "contactid", "contactname",
    "branch", "locationname", "branchname",
    "voucher", "transactionid", "vouchernumber",
    "tax"
]);

function getUnusedColumnsString(row) {
    const unusedParts = [];
    for (const key of Object.keys(row)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!USED_KEYS_NORMALIZED.has(normalizedKey)) {
            const val = row[key];
            if (val !== undefined && val !== null && String(val).trim() !== "") {
                unusedParts.push(`${key}: ${String(val).trim()}`);
            }
        }
    }
    if (unusedParts.length === 0) return "";
    return `[${unusedParts.join(" | ")}]`;
}

// Classification helper based on category
function getAccountType(category) {
    const cat = String(category).trim().toUpperCase();

    // Assets
    if ([
        "CASH", "ACCOUNTS RECEIVABLE", "FIXED ASSET",
        "OTHER CURRENT ASSET", "OTHER ASSET", "BANK",
        "INPUT TAX", "ASSET"
    ].includes(cat)) {
        return "ASSET";
    }

    // Liabilities
    if ([
        "ACCOUNTS PAYABLE", "OTHER CURRENT LIABILITY", "OTHER LIABILITY",
        "NON CURRENT LIABILITY", "OUTPUT TAX", "LIABILITY", "NON CURRENT LIAB"
    ].includes(cat)) {
        return "LIABILITY";
    }

    // Income
    if ([
        "INCOME", "OTHER INCOME", "NCOME"
    ].includes(cat)) {
        return "INCOME";
    }

    // Expense
    if ([
        "EXPENSE", "OTHER EXPENSE", "COST OF GOODS SOLD"
    ].includes(cat)) {
        return "EXPENSE";
    }

    // Equity
    if ([
        "EQUITY", "STOCK"
    ].includes(cat)) {
        return "EQUITY";
    }

    // Substring fallback
    if (cat.includes("ASSET")) return "ASSET";
    if (cat.includes("LIAB") || cat.includes("PAYABLE")) return "LIABILITY";
    if (cat.includes("INC") || cat.includes("REV")) return "INCOME";
    if (cat.includes("EXP") || cat.includes("COST")) return "EXPENSE";
    if (cat.includes("EQ")) return "EQUITY";

    return "ASSET"; // default fallback
}

// Balance calculator depending on account type
function calculateBalance(debit, credit, accountType) {
    if (accountType === "ASSET" || accountType === "EXPENSE") {
        return debit - credit;
    } else {
        return credit - debit;
    }
}

// Clean date parser — works with string dates to avoid JS Date timezone shifts
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

// Normalizes header keys to easily retrieve values from rows
function getRowValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
            return row[key];
        }
        // Check case-insensitive and spacing variations
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const k of Object.keys(row)) {
            const normalizedK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (normalizedK === normalizedKey) {
                if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
                    return row[k];
                }
            }
        }
    }
    return undefined;
}

// Primary bulk import and validation service
exports.processImport = async (fileBuffer, { createdBy, creatorRole, fileName }, skipDuplicates = false) => {
    const importId = new mongoose.Types.ObjectId();

    // Initialize in-memory progress tracker
    global.importProgress = global.importProgress || {};
    global.importProgress[importId] = {
        status: "STARTED",
        percent: 5,
        message: "Reading file...",
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        processedRows: 0,
        completedRows: 0,
        failedRows: 0,
        errors: []
    };

    // Clean up old progress references to prevent leaks
    const oneHourAgo = Date.now() - 3600000;
    for (const id of Object.keys(global.importProgress)) {
        if (global.importProgress[id].timestamp && global.importProgress[id].timestamp < oneHourAgo) {
            delete global.importProgress[id];
        }
    }
    global.importProgress[importId].timestamp = Date.now();

    // Start background processor
    setImmediate(async () => {
        let historyDoc;
        try {
            const startTime = new Date();

            // Create history record
            historyDoc = await ImportHistory.create({
                _id: importId,
                fileName,
                startedBy: createdBy,
                startedByRole: creatorRole,
                status: "STARTED",
                startTime,
            });

            // 1. Read sheet
            const workbook = XLSX.read(fileBuffer, { type: "buffer" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
            const filteredRows = rawRows.filter(row =>
                Object.values(row).some(val => val !== undefined && val !== null && String(val).trim() !== "")
            );

            const totalRows = filteredRows.length;
            global.importProgress[importId].totalRows = totalRows;
            global.importProgress[importId].percent = 15;
            global.importProgress[importId].message = `Analyzing ${totalRows} rows...`;

            if (totalRows === 0) {
                throw new Error("Excel sheet contains no data rows.");
            }

            // 2. Pre-collect unique values for bulk entity lookups
            const uniqueAccountNames = new Set();
            const uniqueContactNames = new Set();
            const uniqueBranchNames = new Set();
            const uniqueVoucherNumbers = new Set();
            const uniqueDates = [];
            const uniqueAmounts = [];

            for (const row of filteredRows) {
                const acc = getRowValue(row, ["Account Name", "account_name", "accountName", "Account"]);
                const contact = getRowValue(row, ["Contact", "contact_name", "contactName", "contact"]);
                const branch = getRowValue(row, ["Branch", "branch_name", "branchName", "branch"]);
                const voucher = getRowValue(row, ["Voucher", "voucher_number", "voucherNumber", "voucher"]);
                const dateVal = getRowValue(row, ["Entry Date", "entry_date", "entryDate", "date"]);
                const amountVal = getRowValue(row, ["Amount", "amount"]);

                if (acc) uniqueAccountNames.add(String(acc).trim());
                if (contact) uniqueContactNames.add(String(contact).trim());
                if (branch) uniqueBranchNames.add(String(branch).trim());
                if (voucher) uniqueVoucherNumbers.add(String(voucher).trim());

                const parsedDate = parseFlexibleDate(dateVal);
                if (parsedDate) uniqueDates.push(parsedDate);

                const amt = parseFloat(amountVal);
                if (!isNaN(amt)) uniqueAmounts.push(amt);
            }

            // 3. Pre-fetch lookup models
            global.importProgress[importId].message = "Caching validation records...";
            global.importProgress[importId].percent = 25;

            // Accounts Cache
            const accountsList = await AccountingCode.find({
                isDeleted: false
            }).lean();
            const accountMap = {};
            accountsList.forEach(a => {
                accountMap[a.name.toLowerCase().trim()] = a;
                if (a.code) {
                    accountMap[a.code.toLowerCase().trim()] = a;
                }
            });

            // Branches Cache
            const branchesList = await Branch.find({
                isDeleted: false
            }).lean();
            const branchMap = {};
            branchesList.forEach(b => {
                branchMap[b.name.toLowerCase().trim()] = b;
                if (b.code) branchMap[b.code.toLowerCase().trim()] = b;
                branchMap[b._id.toString()] = b;
            });

            // Contacts Cache (Customer)
            const customersList = await Customer.find({
                $or: [
                    { name: { $in: Array.from(uniqueContactNames) } },
                    { customerId: { $in: Array.from(uniqueContactNames) } }
                ]
            }).lean();
            const contactMap = {};
            customersList.forEach(c => {
                contactMap[c.name.toLowerCase().trim()] = c;
                if (c.customerId) contactMap[c.customerId.toLowerCase().trim()] = c;
                contactMap[c._id.toString()] = c;
            });

            // Vouchers Cache
            const vouchersList = await Voucher.find({
                voucherNumber: { $in: Array.from(uniqueVoucherNumbers) }
            }).lean();
            const voucherMap = {};
            vouchersList.forEach(v => {
                voucherMap[v.voucherNumber.toLowerCase().trim()] = v;
                voucherMap[v._id.toString()] = v;
            });

            // Fetch DB matches for duplicate validation
            const dbMatchesMap = {};
            if (uniqueDates.length > 0 && uniqueAmounts.length > 0) {
                const dbEntries = await LedgerEntry.find({
                    entryDate: { $in: uniqueDates },
                    amount: { $in: uniqueAmounts }
                }).lean();
                dbEntries.forEach(e => {
                    const key = `${e.entryDate.toISOString().split("T")[0]}_${e.accountingCode.toString()}_${e.amount}_${e.description.toLowerCase().trim()}_${(e.transactionType || "").toLowerCase().trim()}`;
                    dbMatchesMap[key] = true;
                });
            }

            // 4. Validate every row and compute running balances
            global.importProgress[importId].message = "Validating entries...";
            global.importProgress[importId].percent = 40;

            const validatedRows = [];
            const errors = [];
            const localFileDuplicates = {};

            for (let i = 0; i < filteredRows.length; i++) {
                const row = filteredRows[i];
                const rowNum = i + 2; // header line + 1-indexed

                const accName = getRowValue(row, ["Account Name", "account_name", "accountName", "Account"]);
                const accCode = getRowValue(row, ["accountingCode", "Accounting Code", "accounting_code", "Account Code", "Account ID", "account_id"]);
                const dateVal = getRowValue(row, ["Entry Date", "entry_date", "entryDate", "date"]);
                const desc = getRowValue(row, ["Description", "description", "memo", "transaction_details"]);
                const txnType = getRowValue(row, ["Transaction Type", "transaction_type", "transactionType"]);
                const contact = getRowValue(row, ["Contact", "contact", "contact_id"]);
                const branch = getRowValue(row, ["Branch", "branch", "location_name"]);
                const voucher = getRowValue(row, ["Voucher", "voucher", "transaction_id"]);
                const tax = getRowValue(row, ["Tax", "tax"]);
                const transactionIdVal = getRowValue(row, ["Transaction ID", "transaction_id", "transactionId", "Voucher", "voucher"]);
                const transactionIdStr = transactionIdVal ? String(transactionIdVal).trim() : "";

                // Resolve Type and Amount (supporting both separate Debit/Credit columns or single Type/Amount columns)
                let type = "DEBIT";
                let amount = 0;
                const amountStr = getRowValue(row, ["Amount", "amount"]);
                const typeStr = getRowValue(row, ["Type (Debit/Credit)", "type", "debit_credit", "debitCredit"]);

                const debitVal = getRowValue(row, ["debit", "debit_amount", "dr"]);
                const creditVal = getRowValue(row, ["credit", "credit_amount", "cr"]);

                const parsedDebit = (debitVal !== undefined && debitVal !== null && debitVal !== "") ? parseFloat(debitVal) : NaN;
                const parsedCredit = (creditVal !== undefined && creditVal !== null && creditVal !== "") ? parseFloat(creditVal) : NaN;

                if (!isNaN(parsedDebit) && parsedDebit > 0) {
                    type = "DEBIT";
                    amount = parsedDebit;
                } else if (!isNaN(parsedCredit) && parsedCredit > 0) {
                    type = "CREDIT";
                    amount = parsedCredit;
                } else if (!isNaN(parsedDebit) && !isNaN(parsedCredit)) {
                    type = "DEBIT";
                    amount = 0;
                } else if (!isNaN(parsedDebit)) {
                    type = "DEBIT";
                    amount = parsedDebit;
                } else if (!isNaN(parsedCredit)) {
                    type = "CREDIT";
                    amount = parsedCredit;
                } else if (amountStr !== undefined && amountStr !== null && amountStr !== "") {
                    const parsed = parseFloat(amountStr);
                    amount = isNaN(parsed) ? 0 : parsed;
                    if (typeStr) {
                        const normType = String(typeStr).trim().toUpperCase();
                        if (["CREDIT", "CR"].includes(normType)) {
                            type = "CREDIT";
                        } else {
                            type = "DEBIT";
                        }
                    } else {
                        type = "DEBIT";
                    }
                }

                const rowErrors = [];

                // --- 1. Account Name / Code ---
                let resolvedAccount = null;
                if (accName) {
                    const searchKey = String(accName).toLowerCase().trim();
                    resolvedAccount = accountMap[searchKey];
                    if (!resolvedAccount) {
                        const searchKeyNorm = searchKey.replace(/[^a-z0-9]/g, "");
                        resolvedAccount = accountsList.find(acc => {
                            const nameLower = (acc.name || "").toLowerCase().trim();
                            const nameNorm = nameLower.replace(/[^a-z0-9]/g, "");
                            return nameLower === searchKey || (nameNorm && searchKeyNorm && nameNorm === searchKeyNorm);
                        });
                    }
                }

                if (!resolvedAccount && accCode) {
                    const searchKey = String(accCode).toLowerCase().trim();
                    resolvedAccount = accountMap[searchKey];
                    if (!resolvedAccount) {
                        const searchKeyNorm = searchKey.replace(/[^a-z0-9]/g, "");
                        resolvedAccount = accountsList.find(acc => {
                            const codeLower = (acc.code || "").toLowerCase().trim();
                            const codeNorm = codeLower.replace(/[^a-z0-9]/g, "");
                            return codeLower === searchKey || (codeNorm && codeNorm === searchKeyNorm);
                        });
                    }
                }

                if (!resolvedAccount) {
                    if (accName) {
                        rowErrors.push(`Account "${accName}" not found.`);
                    } else if (accCode) {
                        rowErrors.push(`Account with code "${accCode}" not found.`);
                    } else {
                        rowErrors.push("Account accountingCode or Name is required.");
                    }
                }

                // --- 2. Amount ---
                if (isNaN(amount)) {
                    amount = 0;
                }

                // --- 3. Debit/Credit ---
                if (!type) {
                    type = "DEBIT";
                }

                // --- 4. Date ---
                const entryDate = parseFlexibleDate(dateVal);
                if (!entryDate) {
                    rowErrors.push(`Invalid Entry Date: "${dateVal}".`);
                }

                // --- 5. Description ---
                let description = String(desc || "").trim();
                if (!description) {
                    description = "Ledger Import";
                }
                if (transactionIdStr) {
                    description = `${description} - Transaction ID: ${transactionIdStr}`;
                }

                // --- 6. Transaction Type ---
                const transactionType = String(txnType || "").trim();
                if (!transactionType) {
                    rowErrors.push("Transaction Type is required.");
                }

                // --- 7. Contact (Optional) ---
                let resolvedContact = null;
                if (contact) {
                    resolvedContact = contactMap[String(contact).toLowerCase().trim()];
                    if (!resolvedContact && /^[a-fA-F0-9]{24}$/.test(String(contact))) {
                        resolvedContact = contactMap[String(contact)];
                    }
                }

                // --- 8. Branch (Optional) ---
                let resolvedBranch = null;
                if (branch) {
                    const branchStr = String(branch).trim();
                    const branchLower = branchStr.toLowerCase();
                    if (branchLower === "head office") {
                        resolvedBranch = branchesList.find(b => b.code === "PANAMA" || (b.name.toLowerCase() === "panama" && b.type === "BRANCH"));
                    } else if (branchLower === "ola workshop") {
                        resolvedBranch = branchesList.find(b => b.code === "JUC" || b.type === "WORKSHOP");
                    } else {
                        resolvedBranch = branchMap[branchLower];
                        if (!resolvedBranch && /^[a-fA-F0-9]{24}$/.test(branchStr)) {
                            resolvedBranch = branchMap[branchStr];
                        }
                    }
                }

                // --- 9. Voucher (Optional) ---
                let resolvedVoucher = null;
                if (voucher) {
                    resolvedVoucher = voucherMap[String(voucher).toLowerCase().trim()];
                    if (!resolvedVoucher && /^[a-fA-F0-9]{24}$/.test(String(voucher))) {
                        resolvedVoucher = voucherMap[String(voucher)];
                    }
                }

                // If row is invalid, record error and skip processing
                if (rowErrors.length > 0) {
                    errors.push({ row: rowNum, error: rowErrors.join(" ") });
                    continue;
                }

                // Append unused columns and unresolved optional references to description
                const unresolvedParts = [];
                if (contact && !resolvedContact) {
                    unresolvedParts.push(`Contact: ${contact}`);
                }
                if (branch && !resolvedBranch) {
                    unresolvedParts.push(`Branch: ${branch}`);
                }
                if (voucher && !resolvedVoucher) {
                    unresolvedParts.push(`Voucher: ${voucher}`);
                }

                const unusedColsStr = getUnusedColumnsString(row);

                // Combine both unused columns and unresolved references
                const allMetadata = [
                    ...(unusedColsStr ? [unusedColsStr.replace(/^\[|\]$/g, "")] : []),
                    ...unresolvedParts
                ];

                const finalDescription = description + (allMetadata.length > 0 ? ` - [${allMetadata.join(" | ")}]` : "");


                // --- 10. Duplicate Handling ---
                const dupKey = `${entryDate.toISOString().split("T")[0]}_${resolvedAccount._id.toString()}_${amount}_${finalDescription.toLowerCase().trim()}_${transactionType.toLowerCase().trim()}`;

                let isDuplicate = false;
                if (localFileDuplicates[dupKey] || dbMatchesMap[dupKey]) {
                    isDuplicate = true;
                }
                localFileDuplicates[dupKey] = true;

                if (isDuplicate && skipDuplicates) {
                    // Skipped
                    continue;
                }

                validatedRows.push({
                    rowNum,
                    accountingCode: resolvedAccount,
                    type,
                    amount,
                    description: finalDescription,
                    entryDate,
                    transactionType,
                    contact: resolvedContact ? resolvedContact._id : undefined,
                    branch: resolvedBranch ? resolvedBranch._id : undefined,
                    voucher: resolvedVoucher ? resolvedVoucher._id : undefined,
                    transactionId: transactionIdStr || undefined,
                    taxInfo: tax ? { isTaxInclusive: false, taxAmount: 0 } : undefined, // basic placeholder
                    isDuplicate,
                });
            }

            const totalValid = validatedRows.length;
            global.importProgress[importId].validRows = totalValid;
            global.importProgress[importId].invalidRows = errors.length;

            // 5. In-Memory updates of balances (calculating running balances chronological order)
            global.importProgress[importId].message = "Computing running balances...";
            global.importProgress[importId].percent = 60;

            // Sorting valid rows by date to compute balance chronology accurately
            validatedRows.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());

            // Compile current code totals in memory
            const accountTotalsMap = {};
            accountsList.forEach(a => {
                accountTotalsMap[a._id.toString()] = {
                    debitTotal: a.debitTotal || 0,
                    creditTotal: a.creditTotal || 0,
                    category: a.category
                };
            });

            // Assign running balances to ledger entries
            validatedRows.forEach(item => {
                const accId = item.accountingCode._id.toString();
                const total = accountTotalsMap[accId];

                if (item.type === "DEBIT") {
                    total.debitTotal += item.amount;
                } else {
                    total.creditTotal += item.amount;
                }

                const accType = getAccountType(total.category);
                const runningBal = calculateBalance(total.debitTotal, total.creditTotal, accType);
                item.runningBalance = runningBal;
            });

            // 6. Bulk write inserts and balance updates in batches of 1000
            global.importProgress[importId].message = "Writing entries to database...";
            global.importProgress[importId].percent = 70;

            const batchSize = 1000;
            let currentBatch = 0;
            const totalBatches = Math.ceil(totalValid / batchSize);

            for (let i = 0; i < totalValid; i += batchSize) {
                currentBatch++;
                global.importProgress[importId].message = `Importing Batch ${currentBatch}/${totalBatches}`;
                global.importProgress[importId].percent = Math.floor(70 + (currentBatch / totalBatches) * 25);

                const batchRows = validatedRows.slice(i, i + batchSize);

                // Prepare Ledger inserts
                const ledgerWrites = batchRows.map(row => ({
                    insertOne: {
                        document: {
                            accountingCode: row.accountingCode._id,
                            type: row.type,
                            amount: row.amount,
                            description: row.description,
                            entryDate: row.entryDate,
                            transactionType: row.transactionType,
                            contact: row.contact,
                            branch: row.branch,
                            voucher: row.voucher,
                            transactionId: row.transactionId,
                            taxInfo: row.taxInfo,
                            createdBy,
                            creatorRole,
                            runningBalance: row.runningBalance,
                        }
                    }
                }));

                await LedgerEntry.bulkWrite(ledgerWrites, { ordered: false });
                global.importProgress[importId].completedRows += batchRows.length;
            }

            // 7. Write Account balance updates to DB (single bulkWrite)
            global.importProgress[importId].message = "Updating account balances...";
            global.importProgress[importId].percent = 96;

            const codeWrites = Object.keys(accountTotalsMap).map(accId => {
                const total = accountTotalsMap[accId];
                const accType = getAccountType(total.category);
                const currentBalance = calculateBalance(total.debitTotal, total.creditTotal, accType);

                return {
                    updateOne: {
                        filter: { _id: new mongoose.Types.ObjectId(accId) },
                        update: {
                            $set: {
                                debitTotal: total.debitTotal,
                                creditTotal: total.creditTotal,
                                currentBalance: currentBalance
                            }
                        }
                    }
                };
            });

            if (codeWrites.length > 0) {
                await AccountingCode.bulkWrite(codeWrites);
            }

            // 8. Log results in ImportHistory
            const endTime = new Date();
            const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

            historyDoc.status = errors.length === totalRows ? "FAILED" : "COMPLETED";
            historyDoc.endTime = endTime;
            historyDoc.totalRows = totalRows;
            historyDoc.completedRows = global.importProgress[importId].completedRows;
            historyDoc.failedRows = errors.length;
            historyDoc.duration = duration;
            historyDoc.errors = errors;
            await historyDoc.save();

            // Mark progress completed
            global.importProgress[importId].percent = 100;
            global.importProgress[importId].status = "COMPLETED";
            global.importProgress[importId].message = "Import Completed Successfully";
            global.importProgress[importId].duration = duration;
            global.importProgress[importId].failedRows = errors.length;
            global.importProgress[importId].errors = errors;

        } catch (err) {
            console.error("[LedgerBulkUploadService] background task crashed:", err);

            // Mark history failed
            if (historyDoc) {
                historyDoc.status = "FAILED";
                historyDoc.endTime = new Date();
                historyDoc.errors.push({ row: 0, error: err.message });
                await historyDoc.save();
            }

            global.importProgress[importId].status = "FAILED";
            global.importProgress[importId].percent = 100;
            global.importProgress[importId].message = `Process failed: ${err.message}`;
            global.importProgress[importId].errors.push({ row: 0, error: err.message });
        }
    });

    return importId;
};

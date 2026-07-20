const mongoose = require('mongoose');
require('dotenv').config();

const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

const isDebitNormalCategory = (category) => {
    const cat = String(category).toUpperCase();
    return [
        "CASH", "BANK", "ACCOUNTS RECEIVABLE", "FIXED ASSET", "OTHER CURRENT ASSET",
        "OTHER ASSET", "STOCK", "EXPENSE", "COST OF GOODS SOLD", "OTHER EXPENSE", "INPUT TAX",
        "ASSET"
    ].includes(cat);
};

const syncAccountingCodeBalances = async (accountingCodeId) => {
    const result = await LedgerEntry.aggregate([
        { $match: { accountingCode: new mongoose.Types.ObjectId(accountingCodeId) } },
        {
            $group: {
                _id: null,
                debitTotal: {
                    $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] }
                },
                creditTotal: {
                    $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] }
                }
            }
        }
    ]);

    const debitTotal = result.length > 0 ? result[0].debitTotal : 0;
    const creditTotal = result.length > 0 ? result[0].creditTotal : 0;

    const codeDoc = await AccountingCode.findById(accountingCodeId);
    if (codeDoc) {
        codeDoc.debitTotal = debitTotal;
        codeDoc.creditTotal = creditTotal;
        const isDebit = isDebitNormalCategory(codeDoc.category);
        codeDoc.currentBalance = isDebit ? (debitTotal - creditTotal) : (creditTotal - debitTotal);
        await codeDoc.save();
        console.log(`Synced AccountingCode ${codeDoc.code}: debitTotal=${debitTotal}, creditTotal=${creditTotal}, currentBalance=${codeDoc.currentBalance}`);
    }
};

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully to database.");

    // 1. Resolve Accounts Receivable accounting code
    const arCodeDoc = await AccountingCode.findOne({ code: "1.1.03" }) || await AccountingCode.findOne({ accountType: "Accounts Receivable" });
    if (!arCodeDoc) {
        console.error("Accounts Receivable accounting code not found!");
        await mongoose.disconnect();
        return;
    }
    const arCodeId = arCodeDoc._id.toString();
    console.log(`Resolved Accounts Receivable code: ${arCodeDoc.code} (${arCodeDoc.name}) - ID: ${arCodeId}`);

    // 2. Fetch all invoices and build a lookup map
    console.log("Fetching all invoices...");
    const invoicesList = await Invoice.find({});
    const invoiceMap = new Map();
    for (const inv of invoicesList) {
        if (inv.invoiceNumber) {
            invoiceMap.set(inv.invoiceNumber.trim().toUpperCase(), inv);
        }
    }
    console.log(`Loaded ${invoiceMap.size} invoices into memory.`);

    // 3. Fetch all ledger entries that have an invoice number pattern in description
    console.log("Fetching ledger entries containing invoice patterns in description...");
    const invoiceRegex = /((?:INV|MAN|WRK)-\w+(?:-\w+)*)/i;
    const allEntries = await LedgerEntry.find({
        description: { $regex: /INV-|MAN-|WRK-/i }
    });
    console.log(`Found ${allEntries.length} entries matching invoice patterns.`);

    let arDeleted = 0;
    let descSanitized = 0;

    for (const entry of allEntries) {
        const desc = entry.description || "";
        const match = desc.match(invoiceRegex);
        if (!match) continue;

        const invoiceNumber = match[0].trim().toUpperCase();
        const invoiceDoc = invoiceMap.get(invoiceNumber);

        // Check if there is a matching payment record on the invoice
        let hasMatchingPayment = false;
        if (invoiceDoc) {
            const invoicePayments = invoiceDoc.payments || [];
            for (const p of invoicePayments) {
                // Amount must match
                const isAmountMatch = Math.abs(p.amount - entry.amount) < 0.01;
                if (!isAmountMatch) continue;

                const isMatchTxId = entry.transactionId && String(p.transactionId) === String(entry.transactionId);
                const isMatchEntryId = String(p.transactionId) === String(entry._id);
                const isMatchJournalId = entry.manualJournal && String(p.transactionId) === String(entry.manualJournal);

                const prRegex = /PR-\d+/i;
                const pPR = p.note ? p.note.match(prRegex) : null;
                const ePR = entry.description ? entry.description.match(prRegex) : null;
                const isMatchPR = pPR && ePR && pPR[0].toLowerCase() === ePR[0].toLowerCase();

                const isMatchDesc = p.note && entry.description && (
                    p.note.includes(entry.description) || entry.description.includes(p.note)
                );

                const pDate = p.paidAt ? new Date(p.paidAt).getTime() : 0;
                const eDate = entry.entryDate ? new Date(entry.entryDate).getTime() : 0;
                const isMatchDate = Math.abs(pDate - eDate) < (7 * 24 * 60 * 60 * 1000);

                if (isMatchTxId || isMatchEntryId || isMatchJournalId || isMatchPR || isMatchDesc || isMatchDate) {
                    hasMatchingPayment = true;
                    break;
                }
            }
        }

        // If there's no matching payment (or invoice doesn't exist), this entry is an orphan relative to this invoice
        if (!hasMatchingPayment) {
            // Case 1: If it's an Accounts Receivable leg, delete it completely
            if (String(entry.accountingCode) === arCodeId) {
                await LedgerEntry.deleteOne({ _id: entry._id });
                arDeleted++;
                console.log(`Deleted orphaned Accounts Receivable ledger entry ${entry._id} referencing ${invoiceNumber}`);
            } else {
                // Case 2: For other legs (like Bank/Cash), sanitize description to remove the invoice number
                let cleanDesc = desc.replace(match[0], '').trim();
                cleanDesc = cleanDesc
                    .replace(/\s*-\s*$/, '')
                    .replace(/^\s*-\s*/, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                entry.description = cleanDesc;
                entry.contact = undefined;
                await entry.save();
                descSanitized++;
                console.log(`Sanitized description of entry ${entry._id}: "${desc}" -> "${cleanDesc}"`);
            }
        }
    }

    console.log(`\nDeleted ${arDeleted} Accounts Receivable orphaned entries.`);
    console.log(`Sanitized ${descSanitized} non-AR ledger entry descriptions.`);

    if (arDeleted > 0) {
        console.log("Recalculating Accounts Receivable accounting code balance...");
        await syncAccountingCodeBalances(arCodeDoc._id);
        console.log("Accounts Receivable balance synced successfully.");
    }

    // 4. Reconcile invoice payments arrays & statuses
    console.log("\nChecking and reconciling invoice balances and statuses...");
    let reconciledInvoicesCount = 0;
    for (const inv of invoicesList) {
        const originalPaymentsLength = (inv.payments || []).length;
        const cleanedPayments = (inv.payments || []).filter(p => (p.amount || 0) > 0.01);
        
        const actualPaid = cleanedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const expectedBalance = Math.max(0, inv.totalAmountDue - actualPaid);
        
        let expectedStatus = "PENDING";
        if (actualPaid >= inv.totalAmountDue) expectedStatus = "PAID";
        else if (actualPaid > 0) expectedStatus = "PARTIAL";

        const needsSync = cleanedPayments.length !== originalPaymentsLength ||
                          Math.abs(inv.amountPaid - actualPaid) > 0.01 || 
                          Math.abs(inv.balance - expectedBalance) > 0.01 || 
                          inv.status !== expectedStatus;

        if (needsSync) {
            inv.payments = cleanedPayments;
            inv.amountPaid = actualPaid;
            inv.balance = expectedBalance;
            inv.status = expectedStatus;
            if (expectedStatus !== "PAID") {
                inv.paidAt = undefined;
            }
            await inv.save();
            reconciledInvoicesCount++;
            console.log(`Reconciled Invoice ${inv.invoiceNumber}: Status set to ${expectedStatus}, Balance set to ${expectedBalance}`);
        }
    }
    console.log(`Reconciled ${reconciledInvoicesCount} invoices.`);

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch(err => console.error(err));

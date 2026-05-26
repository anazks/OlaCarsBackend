const Voucher = require("../Model/VoucherModel");
const { create: createLedgerEntry } = require("./LedgerService");
const AppError = require("../../../shared/utils/AppError");

/**
 * Creates a Voucher and automatically posts it to the Ledger.
 * Data format: {
 *   type: 'SALES'|'PURCHASE'|'RECEIPT'|'PAYMENT'|'JOURNAL'|'CONTRA',
 *   date: Date,
 *   branch: string,
 *   narration: string,
 *   referenceInfo: { referenceNumber, partyName, partyId, partyType },
 *   lines: [
 *     { accountingCode: string, type: 'DEBIT'|'CREDIT', amount: number, description: string, taxInfo: {} }
 *   ],
 *   createdBy: string,
 *   creatorRole: string
 * }
 */
exports.createVoucher = async (data) => {
    const { lines, ...voucherData } = data;

    // Calculate total amount (sum of debits)
    let totalDebit = 0;
    let totalCredit = 0;
    lines.forEach(line => {
        if (line.type === "DEBIT") totalDebit += line.amount;
        else totalCredit += line.amount;
    });

    // For JOURNAL and CONTRA types, we usually want them to balance
    if (["JOURNAL", "CONTRA"].includes(voucherData.type)) {
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            throw new AppError("Total Debits must equal Total Credits for this voucher type.", 400);
        }
    }

    // 1. Create Voucher Header
    const voucher = new Voucher({
        ...voucherData,
        totalAmount: totalDebit,
        status: "POSTED", // Auto-post as requested
        postedAt: new Date(),
        postedBy: voucherData.createdBy,
        postedByRole: voucherData.creatorRole
    });

    await voucher.save();

    // 2. Create Ledger Entries for each line
    const ledgerEntries = [];
    for (const line of lines) {
        const entry = await createLedgerEntry({
            ...line,
            description: line.description || voucherData.narration,
            voucher: voucher._id,
            branch: voucherData.branch,
            entryDate: voucherData.date || new Date(),
            createdBy: voucherData.createdBy,
            creatorRole: voucherData.creatorRole
        });
        ledgerEntries.push(entry);
    }

    return { voucher, ledgerEntries };
};

/**
 * Retrieves vouchers with filtering and pagination.
 */
exports.getAllVouchers = async (query = {}) => {
    const { page = 1, limit = 20, type, branch, status, startDate, endDate, search } = query;

    const filter = {};
    if (type) filter.type = type;
    if (branch) filter.branch = branch;
    if (status) filter.status = status;
    if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (search) {
        filter.$or = [
            { voucherNumber: { $regex: search, $options: "i" } },
            { narration: { $regex: search, $options: "i" } },
            { "referenceInfo.partyName": { $regex: search, $options: "i" } }
        ];
    }

    const vouchers = await Voucher.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("branch", "name code")
        .populate("lines.accountingCode", "name code");

    const total = await Voucher.countDocuments(filter);

    return {
        vouchers,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * Retrieves a single voucher by ID.
 */
exports.getVoucherById = async (id) => {
    const voucher = await Voucher.findById(id)
        .populate("branch", "name code")
        .populate("lines.accountingCode", "name code")
        .populate("lines.taxInfo.taxApplied");

    if (!voucher) {
        throw new AppError("Voucher not found", 404);
    }
    return voucher;
};

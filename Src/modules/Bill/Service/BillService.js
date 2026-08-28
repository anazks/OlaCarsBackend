const BillRepo = require("../Repo/BillRepo");
const PurchaseOrder = require("../../PurchaseOrder/Model/PurchaseOrderModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const AppError = require("../../../shared/utils/AppError");
const Bill = require("../Model/BillModel");
const Branch = require("../../Branch/Model/BranchModel");
const Supplier = require("../../Supplier/Model/SupplierModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Tax = require("../../Tax/Model/TaxModel");

const parsePaymentDate = (dateInput) => {
    if (!dateInput) return new Date();
    
    let dateStr = typeof dateInput === 'string' ? dateInput : '';
    if (dateStr) {
        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const day = parseInt(match[3], 10);
            
            const hasZeroTime = !dateStr.includes('T') || /T00:00:00/.test(dateStr) || /T00:00:00.000Z/.test(dateStr);
            if (hasZeroTime) {
                const dateObj = new Date();
                dateObj.setFullYear(year, month - 1, day);
                return dateObj;
            }
        }
    }
    
    const parsed = new Date(dateInput);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
};

exports.createBillFromPO = async (poId, userData, overrides = {}) => {
    console.log(`[BillService] Starting conversion for PO: ${poId}`);
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw new AppError("Purchase Order not found", 404);
    if (po.status !== "APPROVED") throw new AppError("Only approved Purchase Orders can be billed", 400);
    if (po.isBilled) throw new AppError("This Purchase Order has already been billed", 400);

    console.log(`[BillService] Processing items for PO: ${po.purchaseOrderNumber}`);
    const extractId = (val) => (val && val._id ? val._id : val);
    
    // Process items and check for missing accountId
    const billItems = po.items.map(item => {
        const accountId = item.accountId || (overrides.itemAccounts && overrides.itemAccounts[item.itemName]);
        if (!accountId) {
            console.error(`[BillService] Item missing account: ${item.itemName}`);
            throw new AppError(`Item "${item.itemName}" is missing an accounting code. Please provide one or update the PO.`, 400);
        }
        return {
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            accountId: extractId(accountId),
            description: item.description
        };
    });

    const billData = {
        billNumber: `BILL-${Date.now()}`,
        purchaseOrder: po._id,
        supplier: extractId(overrides.supplier || po.supplier),
        customer: (overrides.customer && overrides.customer !== "") ? extractId(overrides.customer) : null,
        branch: extractId(po.branch),
        billDate: new Date(),
        dueDate: overrides.dueDate || po.paymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        items: billItems,
        totalAmount: po.totalAmount,
        balanceDue: po.totalAmount,
        status: "OPEN",
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    };

    console.log(`[BillService] Creating bill record...`);
    const bill = await BillRepo.createBill(billData);

    console.log(`[BillService] Updating PO status...`);
    po.isBilled = true;
    await po.save();

    console.log(`[BillService] Posting to ledger...`);
    // Post to Ledger: Debit Expenses, Credit Accounts Payable
    await postBillToLedger(bill, userData);

    console.log(`[BillService] Conversion completed successfully: ${bill.billNumber}`);
    return bill;
};

async function postBillToLedger(bill, userData) {
    const extractId = (val) => (val && val._id ? val._id : val);
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

    // 1. Resolve the CREDIT account (Always Accounts Payable for Bill creation / liability booking)
    let creditAccountId = bill.creditAccountId ? extractId(bill.creditAccountId) : null;

    if (!creditAccountId) {
        const apAccount = await AccountingCode.findOne({ code: "2.1.01" })
            || await AccountingCode.findOne({ accountType: "Accounts Payable", isActive: true, isDeleted: false })
            || await AccountingCode.findOne({ category: /Accounts Payable/i });

        if (!apAccount) {
            console.error(`[BillService] Accounts Payable account (2.1.01) not found. Skipping ledger entry.`);
            return;
        }
        creditAccountId = apAccount._id;
    }

    // 2. DEBIT entries — one per line item (Expense / Asset account)
    let defaultExpenseAccount = null;
    for (const item of bill.items) {
        let debitAccountId = extractId(item.accountId);
        if (!debitAccountId) {
            if (!defaultExpenseAccount) {
                defaultExpenseAccount = await AccountingCode.findOne({ code: "EXP0006" })
                    || await AccountingCode.findOne({ category: /EXPENSE/i, isActive: true, isDeleted: false })
                    || await AccountingCode.findOne({ category: "EXPENSE" });
            }
            if (defaultExpenseAccount) {
                debitAccountId = defaultExpenseAccount._id;
            }
        }

        if (debitAccountId) {
            await LedgerService.create({
                branch: extractId(bill.branch),
                accountingCode: debitAccountId,
                type: "DEBIT",
                amount: item.quantity * item.unitPrice,
                description: `Bill ${bill.billNumber} - Item: ${item.itemName}`,
                entryDate: bill.billDate,
                createdBy: userData.id || userData._id,
                creatorRole: userData.role,
                bill: bill._id
            });
        }
    }

    // 3. CREDIT entry — one for total amount against Accounts Payable
    const creditDesc = `Bill ${bill.billNumber} - Total Liability`;

    await LedgerService.create({
        branch: extractId(bill.branch),
        accountingCode: creditAccountId,
        type: "CREDIT",
        amount: bill.totalAmount,
        description: creditDesc,
        entryDate: bill.billDate,
        createdBy: userData.id || userData._id,
        creatorRole: userData.role,
        bill: bill._id
    });
}

exports.getAllBills = async (query = {}) => {
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10);

    const mongooseQuery = {};

    // 1. Status Filter
    if (query.status && query.status !== 'ALL') {
        if (typeof query.status === 'string' && query.status.includes(',')) {
            mongooseQuery.status = { $in: query.status.split(',').map(s => s.trim()) };
        } else {
            mongooseQuery.status = query.status;
        }
    }

    // 2. Branch Filter
    if (query.branch && query.branch !== 'all') {
        mongooseQuery.branch = query.branch;
    }

    // 3. Supplier Filter
    const targetSupplierId = query.supplier || query.supplierId;
    if (targetSupplierId) {
        mongooseQuery.supplier = targetSupplierId;
    }

    // 4. Date Range Filters (billDate)
    const fromDateVal = query.fromDate || query.startDate;
    const toDateVal = query.toDate || query.endDate;
    if (fromDateVal || toDateVal) {
        mongooseQuery.billDate = {};
        if (fromDateVal) {
            mongooseQuery.billDate.$gte = new Date(fromDateVal + 'T00:00:00.000Z');
        }
        if (toDateVal) {
            mongooseQuery.billDate.$lte = new Date(toDateVal + 'T23:59:59.999Z');
        }
    }

    // 5. Month & Year Filters
    if (query.month || query.year) {
        const now = new Date();
        const y = query.year ? parseInt(query.year, 10) : now.getFullYear();
        if (query.month) {
            const m = parseInt(query.month, 10) - 1;
            mongooseQuery.billDate = {
                $gte: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
                $lte: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
            };
        } else {
            mongooseQuery.billDate = {
                $gte: new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0)),
                $lte: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999))
            };
        }
    }

    // 6. Search Filter (by Bill Number, Supplier Name, or Notes)
    if (query.search) {
        const searchRegex = new RegExp(query.search, 'i');
        
        // Find matching supplier IDs
        const matchingSuppliers = await Supplier.find({ name: searchRegex }).select('_id').lean();
        const supplierIds = matchingSuppliers.map(s => s._id);

        mongooseQuery.$or = [
            { billNumber: searchRegex },
            { notes: searchRegex },
            { supplier: { $in: supplierIds } }
        ];
    }

    const hasDateFilter = !!(query.fromDate || query.toDate || query.startDate || query.endDate || query.month || query.year);

    // Default to start of current month to today's date if no date filters are supplied and no supplier is targeted, and not explicitly ignored
    if (!hasDateFilter && !targetSupplierId && !query.search && query.ignoreDefaultDates !== 'true' && query.ignoreDefaultDates !== true) {
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0));
        const endOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
        mongooseQuery.billDate = {
            $gte: startOfMonth,
            $lte: endOfToday
        };
    }

    // Skip heavy aggregation since dashboard metrics calculation is bypassed for speed/optimization
    const metrics = {
        totalBilled: 0,
        totalBalanceDue: 0,
        openCount: 0,
        partialCount: 0,
        paidCount: 0,
        isFilteredPeriod: hasDateFilter
    };

    if (limit) {
        const result = await BillRepo.getAllBillsPaginated(mongooseQuery, page, limit);
        return {
            data: result.data,
            pagination: result.pagination,
            metrics
        };
    } else {
        const bills = await BillRepo.getAllBills(mongooseQuery);
        return {
            data: bills,
            pagination: {
                totalItems: bills.length,
                totalPages: 1,
                currentPage: 1,
                limit: bills.length
            },
            metrics
        };
    }
};

exports.getBillById = async (id) => {
    return await BillRepo.getBillById(id);
};

exports.recordBillPayment = async (billId, paymentData, userData) => {
    const bill = await BillRepo.getBillById(billId);
    if (!bill) throw new AppError("Bill not found", 404);

    if (paymentData.totalAmount > bill.balanceDue) {
        throw new AppError("Payment amount exceeds balance due", 400);
    }

    const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
    const payment = new PaymentTransaction({
        ...paymentData,
        baseAmount: paymentData.totalAmount,
        paymentDate: parsePaymentDate(paymentData.paymentDate),
        referenceId: billId,
        referenceModel: "Bill",
        transactionCategory: "EXPENSE",
        transactionType: "DEBIT",
        branch: bill.branch,
        supplier: typeof bill.supplier === 'object' ? bill.supplier._id : bill.supplier,
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    });

    await payment.save();

    // Trigger Ledger if completed
    if (payment.status === "COMPLETED") {
        const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
        
        // Fetch and populate accountingCode to ensure autoGenerateLedgerEntry has full details
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accCode = await AccountingCode.findById(payment.accountingCode);
        const populatedTx = { ...payment.toObject(), accountingCode: accCode };
        
        await autoGenerateLedgerEntry(populatedTx);

        // Update bill balance & payment history
        bill.amountPaid += payment.totalAmount;
        if (bill.balanceDue <= 0) {
            bill.status = "PAID";
            bill.paidAt = payment.paymentDate || new Date();
        } else {
            bill.status = "PARTIALLY_PAID";
        }

        bill.payments = bill.payments || [];
        bill.payments.push({
            amount: payment.totalAmount,
            paidAt: payment.paymentDate || new Date(),
            paymentMethod: payment.paymentMethod || "Bank Transfer",
            transactionId: payment.referenceNumber || payment.transactionId || undefined,
            note: payment.notes || `Bill Payment (${bill.billNumber})`
        });

        await bill.save();

        // Trigger draft Fixed Asset creation if the bill is fully paid
        if (bill.status === "PAID") {
            try {
                const FixedAssetService = require("../../FixedAsset/Service/FixedAssetService");
                await FixedAssetService.autoCreateDraftAssetsFromBill(bill._id, userData);
            } catch (faErr) {
                console.error("[BillService] Failed to trigger auto fixed asset creation:", faErr);
            }
        }

        // AUTO-CREATE PAYMENT MADE RECORD (Zoho Accounting Integration)
        try {
            const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");

            // Normalize paymentMethod for PaymentMade schema enum: ["Cash", "Bank Transfer", "Card", "Cheque", "Other"]
            const methodUpper = (payment.paymentMethod || "").toUpperCase();
            let normalizedPMMethod = "Other";
            if (methodUpper.includes("CASH")) normalizedPMMethod = "Cash";
            else if (methodUpper.includes("BANK") || methodUpper.includes("TRANSFER") || methodUpper.includes("WIRE")) normalizedPMMethod = "Bank Transfer";
            else if (methodUpper.includes("CARD")) normalizedPMMethod = "Card";
            else if (methodUpper.includes("CHEQUE")) normalizedPMMethod = "Cheque";

            const pmData = {
                paymentNumber: `PMT-${Date.now()}`,
                supplier: typeof bill.supplier === 'object' ? bill.supplier._id : bill.supplier,
                amount: payment.totalAmount,
                paymentDate: payment.paymentDate || new Date(),
                paymentMethod: normalizedPMMethod,
                notes: payment.notes || `Bill Payment (${bill.billNumber})`,
                bills: [{
                    billId: bill._id,
                    billNumber: bill.billNumber,
                    amountApplied: payment.totalAmount
                }],
                paidThroughAccount: payment.accountingCode,
                branch: bill.branch,
                status: "COMPLETED"
            };
            const pmDoc = await PaymentMade.create(pmData);
            console.log(`[BillService] PaymentMade record created successfully: ${pmDoc.paymentNumber}`);
        } catch (pmErr) {
            console.error("[BillService] Failed to auto-create PaymentMade record:", pmErr);
        }
    }

    return payment;
};

exports.disposePO = async (poId, userData) => {
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw new AppError("Purchase Order not found", 404);
    
    const previousStatus = po.status;
    po.status = "DISPOSED";
    po.editHistory.push({
        editedBy: userData.id || userData._id,
        editorRole: userData.role,
        previousStatus: previousStatus,
        changesSummary: "Purchase Order Disposed/Closed"
    });
    
    return await po.save();
};

exports.createBill = async (billData, userData) => {
    console.log(`[BillService] Starting manual bill creation`);
    const extractId = (val) => (val && val._id ? val._id : val);
    
    // Process items and validate
    if (!billData.items || !billData.items.length) {
        throw new AppError("A bill must contain at least one item", 400);
    }
    
    const billItems = billData.items.map(item => {
        if (!item.accountId) {
            throw new AppError(`Item "${item.itemName}" is missing a debit account code.`, 400);
        }
        return {
            itemName: item.itemName,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            accountId: extractId(item.accountId),
            description: item.description || ""
        };
    });

    const totalAmount = billItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    let taxPercentage = 0;
    if (billData.taxId) {
        const Tax = require("../../Tax/Model/TaxModel");
        const tax = await Tax.findById(billData.taxId);
        if (tax) {
            taxPercentage = tax.rate;
        }
    }

    // Resolve and validate purchaseType + creditAccountId
    const purchaseType = (billData.purchaseType || "CREDIT").toUpperCase();
    if (!["CASH", "BANK", "CREDIT"].includes(purchaseType)) {
        throw new AppError(`Invalid purchase type: "${billData.purchaseType}". Must be CASH, BANK, or CREDIT.`, 400);
    }

    let creditAccountId = billData.creditAccountId ? extractId(billData.creditAccountId) : undefined;
    if (creditAccountId) {
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const creditAcc = await AccountingCode.findById(creditAccountId);
        if (!creditAcc) {
            throw new AppError("Credit account not found.", 400);
        }
        const creditCat = (creditAcc.category || "").toLowerCase().trim();
        const creditType = (creditAcc.accountType || "").toLowerCase().trim();
        const isCash = creditType === "cash" || creditCat === "cash";
        const isBank = creditType === "bank" || creditCat === "bank";
        const isAP = creditType === "accounts payable" || creditCat === "accounts payable" || creditAcc.code === "2.1.01";

        if (purchaseType === "CASH" && !isCash) {
            throw new AppError(`Purchase Type is CASH but credit account "${creditAcc.code}" is not a Cash account (type: "${creditAcc.accountType || creditAcc.category}").`, 400);
        }
        if (purchaseType === "BANK" && !isBank) {
            throw new AppError(`Purchase Type is BANK but credit account "${creditAcc.code}" is not a Bank account (type: "${creditAcc.accountType || creditAcc.category}").`, 400);
        }
        if (purchaseType === "CREDIT" && !isAP) {
            throw new AppError(`Purchase Type is CREDIT but credit account "${creditAcc.code}" is not an Accounts Payable account (type: "${creditAcc.accountType || creditAcc.category}").`, 400);
        }
    }

    const savedBillData = {
        billNumber: billData.billNumber || `BILL-${Date.now()}`,
        supplier: extractId(billData.supplier),
        customer: (billData.customer && billData.customer !== "") ? extractId(billData.customer) : null,
        branch: extractId(billData.branch),
        billDate: billData.billDate ? new Date(billData.billDate) : new Date(),
        dueDate: billData.dueDate ? new Date(billData.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        items: billItems,
        totalAmount: totalAmount,
        balanceDue: totalAmount,
        status: "OPEN",
        purchaseType,
        creditAccountId: creditAccountId || undefined,
        isInclusiveTax: !!billData.isInclusiveTax,
        taxId: billData.taxId ? extractId(billData.taxId) : undefined,
        taxPercentage: taxPercentage,
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    };

    console.log(`[BillService] Creating manual bill record...`);
    const bill = await BillRepo.createBill(savedBillData);

    console.log(`[BillService] Posting manual bill to ledger...`);
    await postBillToLedger(bill, userData);

    console.log(`[BillService] Manual bill creation completed successfully: ${bill.billNumber}`);
    return bill;
};

exports.bulkUploadBills = async (rows, actor, userBranchId) => {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        throw new AppError("No data rows provided.", 400);
    }

    // 1. Pre-load reference collections for fast lookups
    const branchesList = await Branch.find({ isDeleted: false });
    const branchesByName = new Map();
    const branchesByCode = new Map();
    const branchesById = new Map();
    for (const b of branchesList) {
        if (b.name) {
            branchesByName.set(b.name.trim().toLowerCase().replace(/\s+/g, ' '), b);
        }
        if (b.code) {
            branchesByCode.set(b.code.trim().toLowerCase(), b);
        }
        branchesById.set(b._id.toString(), b);
    }

    const suppliersList = await Supplier.find({ isDeleted: false });
    const suppliersByName = new Map();
    const suppliersByNumber = new Map();
    for (const s of suppliersList) {
        if (s.name) {
            suppliersByName.set(s.name.trim().toLowerCase().replace(/\s+/g, ' '), s);
        }
        if (s.vendorNumber) {
            suppliersByNumber.set(s.vendorNumber.trim().toLowerCase(), s);
        }
    }

    const accountsList = await AccountingCode.find({ isDeleted: false, isActive: true });
    const accountsByCode = new Map();
    const accountsByName = new Map();
    for (const acc of accountsList) {
        if (acc.code) {
            accountsByCode.set(acc.code.trim().toLowerCase(), acc);
        }
        if (acc.name) {
            accountsByName.set(acc.name.trim().toLowerCase().replace(/\s+/g, ' '), acc);
        }
    }

    const poList = await PurchaseOrder.find({});
    const poByNumber = new Map();
    for (const po of poList) {
        if (po.purchaseOrderNumber) {
            poByNumber.set(po.purchaseOrderNumber.trim().toLowerCase(), po);
        }
    }

    const taxList = await Tax.find({ isDeleted: false });

    // 2. Utility functions
    const getRowVal = (r, possibleKeys) => {
        for (const key of possibleKeys) {
            const cleanKey = key.replace(/^\ufeff/, '').trim().toLowerCase();
            if (r[key] !== undefined) return r[key];
            for (const k of Object.keys(r)) {
                const cleanK = k.replace(/^\ufeff/, '').trim().toLowerCase();
                if (cleanK === cleanKey) {
                    return r[k];
                }
            }
        }
        return undefined;
    };

    const parseFlexibleDate = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
        if (typeof dateStr === 'number') {
            const date = new Date((dateStr - 25569) * 86400 * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        const str = dateStr.toString().trim();
        if (!str) return null;
        const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
        const match = str.match(dmyRegex);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3], 10);
            const date = new Date(year, month, day);
            if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
                return date;
            }
        }
        const parsedDate = new Date(str);
        return isNaN(parsedDate.getTime()) ? null : parsedDate;
    };

    const createdBills = [];
    const updatedBills = [];
    const errors = [];
    const skipped = [];

    // 3. Group rows by Bill Number (multiple rows = multiple line items)
    const billGroups = new Map();
    let rowCounter = 0;
    for (const row of rows) {
        rowCounter++;
        const billNum = getRowVal(row, ["Bill Number", "billNumber"]);
        const key = (billNum || `BILL-TEMP-${Date.now()}-${rowCounter}`).toString().trim();
        if (!billGroups.has(key)) {
            billGroups.set(key, []);
        }
        billGroups.get(key).push({ row, originalIndex: rowCounter });
    }

    // 4. Process each bill group
    for (const [key, grouped] of billGroups.entries()) {
        const headerRowObj = grouped[0];
        const headerRow = headerRowObj.row;
        const origIdx = headerRowObj.originalIndex;

        // --- Resolve Supplier ---
        const vendorName = getRowVal(headerRow, ["Vendor Name", "vendorName", "supplierName", "supplier"]);
        const vendorNumber = getRowVal(headerRow, ["Vendor Number", "vendorNumber", "supplierNumber"]);

        let supplierDoc = null;
        if (vendorName) {
            const cleanName = vendorName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            supplierDoc = suppliersByName.get(cleanName);
            if (!supplierDoc) {
                for (const [dbName, dbSup] of suppliersByName.entries()) {
                    const cleanDb = dbName.replace(/[^a-z0-9\s]/g, '').trim();
                    const cleanInput = cleanName.replace(/[^a-z0-9\s]/g, '').trim();
                    if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                        supplierDoc = dbSup;
                        break;
                    }
                }
            }
        }
        if (!supplierDoc && vendorNumber) {
            supplierDoc = suppliersByNumber.get(vendorNumber.toString().trim().toLowerCase());
        }

        // --- Resolve Branch ---
        const branchId = getRowVal(headerRow, ["Branch ID", "branchId"]);
        const branchName = getRowVal(headerRow, ["Branch Name", "branchName"]);
        const locationName = getRowVal(headerRow, ["Location Name", "locationName", "Location", "location"]);
        const lineItemLocationName = getRowVal(headerRow, ["Line Item Location Name", "lineItemLocationName"]);

        let branchDoc = null;
        if (branchId) {
            const cleanId = branchId.toString().trim();
            branchDoc = branchesById.get(cleanId) || branchesByCode.get(cleanId.toLowerCase());
        }
        if (!branchDoc && branchName) {
            const cleanBranchName = branchName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            branchDoc = branchesByName.get(cleanBranchName);
        }
        if (!branchDoc && locationName) {
            const cleanLocName = locationName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            branchDoc = branchesByName.get(cleanLocName);
        }
        if (!branchDoc && lineItemLocationName) {
            const cleanLineLocName = lineItemLocationName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            branchDoc = branchesByName.get(cleanLineLocName);
        }
        if (!branchDoc && userBranchId) {
            branchDoc = branchesById.get(userBranchId.toString());
        }
        if (!branchDoc) {
            branchDoc = branchesList.find(b => b.status === "ACTIVE") || branchesList[0];
        }

        if (!branchDoc) {
            errors.push(`Bill "${key}" (Row ${origIdx}): Branch could not be resolved.`);
            continue;
        }

        // --- Resolve PurchaseOrder ---
        const poVal = getRowVal(headerRow, ["PurchaseOrder", "purchaseOrder", "Purchase Order", "purchaseOrderNumber"]);
        let poDoc = null;
        if (poVal) {
            const cleanPo = poVal.toString().trim().toLowerCase();
            poDoc = poByNumber.get(cleanPo);
        }

        // --- Check if bill already exists ---
        const existingBill = await Bill.findOne({ billNumber: key });

        // --- Build items array ---
        const items = [];
        let calculatedTotal = 0;

        for (const itemObj of grouped) {
            const r = itemObj.row;
            // Prioritize Item Name over Description
            const rawItemNameVal = getRowVal(r, ["Item Name", "itemName", "Item", "item"]) 
                || getRowVal(r, ["Description", "description"]) 
                || "No Item Details";
            const rawQtyVal = getRowVal(r, ["Quantity", "quantity"]) ?? "1";
            const rawPriceVal = getRowVal(r, ["Rate", "rate", "Item Price", "itemPrice", "Unit Price", "unitPrice"]) ?? "0";
            const rawItemDesc = getRowVal(r, ["Description", "description"]) || "";
            const rawAccCodeVal = getRowVal(r, ["Debit Account", "debitAccount", "Debit Account Code", "debitAccountCode", "Account Code", "accountCode"]) ?? "";
            const rawAccNameVal = getRowVal(r, ["Debit Account Name", "debitAccountName", "Debit Account", "debitAccount", "Account", "accountName", "account"]) ?? "";

            const itemNameStr = rawItemNameVal.toString().trim();
            const isCommaSeparated = itemNameStr.includes(",") || rawQtyVal.toString().includes(",") || rawPriceVal.toString().includes(",");

            const itemNames = isCommaSeparated 
                ? itemNameStr.split(",").map(s => s.trim()).filter(Boolean) 
                : [itemNameStr];
            const quantities = isCommaSeparated 
                ? rawQtyVal.toString().split(",").map(s => s.trim()) 
                : [rawQtyVal.toString().trim()];
            const rates = isCommaSeparated 
                ? rawPriceVal.toString().split(",").map(s => s.trim()) 
                : [rawPriceVal.toString().trim()];
            const accCodes = rawAccCodeVal.toString().includes(",") 
                ? rawAccCodeVal.toString().split(",").map(s => s.trim()) 
                : [rawAccCodeVal.toString().trim()];
            const accNames = rawAccNameVal.toString().includes(",") 
                ? rawAccNameVal.toString().split(",").map(s => s.trim()) 
                : [rawAccNameVal.toString().trim()];
            const itemDescs = rawItemDesc.toString().includes(",") 
                ? rawItemDesc.toString().split(",").map(s => s.trim()) 
                : [rawItemDesc.toString().trim()];

            const subItemCount = Math.max(itemNames.length, quantities.length, rates.length);

            for (let i = 0; i < subItemCount; i++) {
                const subItemName = itemNames[i] || itemNames[0] || "Item";
                const subQty = Number(quantities[i] !== undefined ? quantities[i] : quantities[0]) || 1;
                const subRate = Number(rates[i] !== undefined ? rates[i] : rates[0]) || 0;
                const subAccCode = accCodes[i] !== undefined ? accCodes[i] : accCodes[0];
                const subAccName = accNames[i] !== undefined ? accNames[i] : accNames[0];
                const subDesc = itemDescs[i] !== undefined ? itemDescs[i] : (rawItemDesc || subItemName);

                let accountId = null;
                if (subAccCode) {
                    const codeStr = subAccCode.toLowerCase();
                    const accDoc = accountsByCode.get(codeStr);
                    if (accDoc) accountId = accDoc._id;
                }
                if (!accountId && subAccName) {
                    const nameStr = subAccName.toLowerCase().replace(/\s+/g, ' ');
                    const accDoc = accountsByName.get(nameStr);
                    if (accDoc) accountId = accDoc._id;
                }

                if (!accountId) {
                    const missingAcc = subAccCode || subAccName || "Not specified";
                    errors.push(`Bill "${key}" (Row ${origIdx}): Item "${subItemName}" Debit Account "${missingAcc}" was not found in Chart of Accounts.`);
                    continue;
                }

                items.push({
                    itemName: subItemName,
                    quantity: subQty,
                    unitPrice: subRate,
                    description: subDesc,
                    accountId
                });

                calculatedTotal += subQty * subRate;
            }
        }

        if (items.length === 0) {
            errors.push(`Bill "${key}" (Row ${origIdx}): No valid items found.`);
            continue;
        }

        // --- Resolve Tax Profile & Inclusive flag ---
        const rawIsInclusiveTax = getRowVal(headerRow, ["Is Inclusive Tax", "isInclusiveTax"]);
        const isInclusiveTax = (rawIsInclusiveTax === true || rawIsInclusiveTax === 1 || rawIsInclusiveTax?.toString().toLowerCase() === "true" || rawIsInclusiveTax?.toString().toLowerCase() === "yes" || rawIsInclusiveTax?.toString().toLowerCase() === "y");

        const taxNameExcel = getRowVal(headerRow, ["Tax Name", "taxName"]);
        const taxPctExcel = Number(getRowVal(headerRow, ["Tax Percentage", "taxPercentage"])) || 0;
        const taxIDExcel = getRowVal(headerRow, ["Tax ID", "taxId"]);

        let taxDoc = null;
        if (taxIDExcel && require("mongoose").Types.ObjectId.isValid(taxIDExcel.toString().trim())) {
            const cleanId = taxIDExcel.toString().trim();
            taxDoc = taxList.find(t => t._id.toString() === cleanId);
        }
        if (!taxDoc && taxNameExcel) {
            const cleanTaxName = taxNameExcel.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            taxDoc = taxList.find(t => t.name.toLowerCase().replace(/\s+/g, ' ') === cleanTaxName);
        }
        if (!taxDoc && taxPctExcel) {
            taxDoc = taxList.find(t => t.rate === taxPctExcel);
        }

        let taxId = undefined;
        let taxPercentage = 0;
        if (taxDoc) {
            taxId = taxDoc._id;
            taxPercentage = taxDoc.rate;
        } else if (taxPctExcel) {
            taxPercentage = taxPctExcel;
        }

        // --- Resolve Purchase Type & Credit Account ---
        const rawPurchaseType = (getRowVal(headerRow, ["Purchase Type", "purchaseType", "Bill Type", "billType"]) || "CREDIT").toString().trim().toUpperCase();
        const purchaseTypeMap = {
            "CASH": "CASH", "CASH PURCHASE": "CASH",
            "BANK": "BANK", "BANK PURCHASE": "BANK", "BANK TRANSFER": "BANK",
            "CREDIT": "CREDIT", "CREDIT PURCHASE": "CREDIT", "ON CREDIT": "CREDIT", "PAYABLE": "CREDIT"
        };
        const purchaseType = purchaseTypeMap[rawPurchaseType] || "CREDIT";

        const creditAccCodeVal = getRowVal(headerRow, ["Credit Account", "creditAccount", "Credit Account Code", "creditAccountCode", "Credit Account Name", "creditAccountName", "Accounts Payable", "accountsPayable"]);
        let creditAccountId = null;
        let creditAccountDoc = null;

        if (creditAccCodeVal) {
            const cleanCreditCode = creditAccCodeVal.toString().trim().toLowerCase();
            creditAccountDoc = accountsByCode.get(cleanCreditCode) || null;
            if (!creditAccountDoc) {
                // Try by name
                const cleanCreditName = creditAccCodeVal.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                creditAccountDoc = accountsByName.get(cleanCreditName) || null;
            }
        }

        // If no Credit Account specified in Excel/CSV, default to 2.1.01 (Accounts Payable)
        if (!creditAccountDoc) {
            creditAccountDoc = accountsByCode.get("2.1.01") || Array.from(accountsByCode.values()).find(a => (a.accountType || a.category || '').toLowerCase().includes("payable")) || null;
        }

        if (creditAccountDoc) {
            creditAccountId = creditAccountDoc._id;
        }

        // If bill already exists in DB, append new items and update totalAmount & balanceDue
        if (existingBill) {
            try {
                existingBill.items.push(...items);
                const newTotal = (existingBill.totalAmount || 0) + calculatedTotal;
                const paid = existingBill.amountPaid || 0;
                const newBalance = Math.max(0, newTotal - paid);

                existingBill.totalAmount = newTotal;
                existingBill.balanceDue = newBalance;
                if (newBalance <= 0) {
                    existingBill.status = "PAID";
                } else if (paid > 0) {
                    existingBill.status = "PARTIALLY_PAID";
                } else {
                    existingBill.status = "OPEN";
                }

                // Update purchaseType and creditAccountId if provided
                if (purchaseType) existingBill.purchaseType = purchaseType;
                if (creditAccountId) existingBill.creditAccountId = creditAccountId;

                existingBill.isInclusiveTax = isInclusiveTax;
                if (taxId) {
                    existingBill.taxId = taxId;
                    existingBill.taxPercentage = taxPercentage;
                }
                await existingBill.save();
                updatedBills.push(existingBill.billNumber);

                // Post incremental GL entries for newly appended items
                if (existingBill.status !== 'DRAFT' && calculatedTotal > 0) {
                    try {
                        const tempIncrementalBill = {
                            _id: existingBill._id,
                            billNumber: existingBill.billNumber,
                            branch: existingBill.branch,
                            billDate: existingBill.billDate || new Date(),
                            totalAmount: calculatedTotal,
                            items: items,
                            purchaseType: existingBill.purchaseType,
                            creditAccountId: existingBill.creditAccountId
                        };
                        await postBillToLedger(tempIncrementalBill, { id: actor.id, role: actor.role });
                    } catch (glErr) {
                        console.error(`[BillService] Failed to post incremental GL for bill ${existingBill.billNumber}:`, glErr);
                    }
                }
            } catch (err) {
                errors.push(`Bill "${key}" (Row ${origIdx}): Failed to update existing bill - ${err.message}`);
            }
            continue;
        }

        // --- Parse header-level fields ---
        const rawBillDate = getRowVal(headerRow, ["Bill Date", "billDate"]);
        const billDate = parseFlexibleDate(rawBillDate) || new Date();

        const rawDueDate = getRowVal(headerRow, ["Due Date", "dueDate"]);
        const dueDate = parseFlexibleDate(rawDueDate) || undefined;

        const rawStatus = (getRowVal(headerRow, ["Bill Status", "billStatus", "status"]) || "OPEN").toString().trim().toUpperCase();
        let status = "OPEN";
        const statusMap = {
            "DRAFT": "DRAFT",
            "OPEN": "OPEN",
            "PARTIALLY_PAID": "PARTIALLY_PAID",
            "PARTIALLY PAID": "PARTIALLY_PAID",
            "PAID": "PAID",
            "VOID": "VOID",
            "CLOSED": "PAID",
            "OVERDUE": "OPEN"
        };
        if (statusMap[rawStatus]) {
            status = statusMap[rawStatus];
        }

        // Use Excel Total if available and greater than calculated
        const excelTotal = Number(getRowVal(headerRow, ["Total", "total"])) || 0;
        const totalAmount = calculatedTotal > 0 ? calculatedTotal : excelTotal;

        const excelBalance = Number(getRowVal(headerRow, ["Balance", "balance"])) || totalAmount;
        const amountPaid = Math.max(0, totalAmount - excelBalance);

        // --- Build notes from unmapped document-level fields ---
        const billId = getRowVal(headerRow, ["Bill ID", "billId"]);
        const accountsPayable = getRowVal(headerRow, ["Accounts Payable", "accountsPayable"]);
        const entityDiscountPercent = getRowVal(headerRow, ["Entity Discount Percent", "entityDiscountPercent"]);
        const paymentTerms = getRowVal(headerRow, ["Payment Terms", "paymentTerms"]);
        const paymentTermsLabel = getRowVal(headerRow, ["Payment Terms Label", "paymentTermsLabel"]);
        const currencyCode = getRowVal(headerRow, ["Currency Code", "currencyCode"]);
        const exchangeRate = getRowVal(headerRow, ["Exchange Rate", "exchangeRate"]);
        const subTotal = getRowVal(headerRow, ["SubTotal", "subTotal", "subtotal"]);
        const retentionFCY = getRowVal(headerRow, ["TotalRetentionAmountFCY", "totalRetentionAmountFCY"]);
        const retentionBCY = getRowVal(headerRow, ["TotalRetentionAmountBCY", "totalRetentionAmountBCY"]);
        const adjustment = getRowVal(headerRow, ["Adjustment", "adjustment"]);
        const adjustmentDesc = getRowVal(headerRow, ["Adjustment Description", "adjustmentDescription"]);
        const adjustmentAccount = getRowVal(headerRow, ["Adjustment Account", "adjustmentAccount"]);
        const createdByExcel = getRowVal(headerRow, ["Created By", "createdBy"]);

        let docDescParts = [];
        const unmappedDocFields = {
            "Bill ID": billId,
            "Accounts Payable": accountsPayable,
            "Entity Discount Percent": entityDiscountPercent,
            "Payment Terms": paymentTerms,
            "Payment Terms Label": paymentTermsLabel,
            "Currency Code": currencyCode,
            "Exchange Rate": exchangeRate,
            "SubTotal": subTotal,
            "TotalRetentionAmountFCY": retentionFCY,
            "TotalRetentionAmountBCY": retentionBCY,
            "Adjustment": adjustment,
            "Adjustment Description": adjustmentDesc,
            "Adjustment Account": adjustmentAccount,
            "Is Inclusive Tax": isInclusiveTax,
            "Created By (Original)": createdByExcel
        };

        for (const [k, v] of Object.entries(unmappedDocFields)) {
            if (v !== undefined && v !== null && v !== "") {
                docDescParts.push(`${k}: ${v}`);
            }
        }

        // If supplier unresolved, store vendor info in notes
        if (!supplierDoc) {
            if (vendorName) docDescParts.push(`Vendor Name: ${vendorName}`);
            if (vendorNumber) docDescParts.push(`Vendor Number: ${vendorNumber}`);
        }

        const newBillData = {
            billNumber: key,
            purchaseOrder: poDoc ? poDoc._id : undefined,
            supplier: supplierDoc ? supplierDoc._id : undefined,
            branch: branchDoc._id,
            billDate,
            dueDate,
            items,
            totalAmount,
            amountPaid,
            balanceDue: totalAmount - amountPaid,
            status,
            purchaseType,
            creditAccountId: creditAccountId || undefined,
            isInclusiveTax,
            taxId,
            taxPercentage,
            notes: docDescParts.join(" | "),
            createdBy: actor.id,
            creatorRole: actor.role
        };

        try {
            const created = await Bill.create(newBillData);
            createdBills.push(created);

            if (created.status !== 'DRAFT') {
                try {
                    await postBillToLedger(created, { id: actor.id, role: actor.role });
                } catch (ledgerErr) {
                    console.error(`[BillService] Failed to post bulk bill ${created.billNumber} to ledger:`, ledgerErr);
                }
            }
        } catch (err) {
            errors.push(`Bill "${key}" (Row ${origIdx}): Failed to create - ${err.message}`);
        }
    }

    return {
        successCount: createdBills.length,
        updatedCount: updatedBills.length,
        errorCount: errors.length,
        skippedCount: skipped.length,
        errors,
        skipped,
        createdBills: createdBills.map(b => b.billNumber),
        updatedBills
    };
};
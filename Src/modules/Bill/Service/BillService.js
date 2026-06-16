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
    
    // 1. Find the Accounts Payable account ID (assuming code 2.1.01 exists)
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
    const apAccount = await AccountingCode.findOne({ code: "2.1.01", category: "LIABILITY" });
    
    if (!apAccount) {
        console.error("[BillService] Accounts Payable account (2.1.01) not found. Skipping ledger entry.");
        return;
    }

    // 2. Create entries for each item (Debit Expense)
    for (const item of bill.items) {
        await LedgerService.create({
            branch: extractId(bill.branch),
            accountingCode: extractId(item.accountId),
            type: "DEBIT",
            amount: item.quantity * item.unitPrice,
            description: `Bill ${bill.billNumber} - Item: ${item.itemName}`,
            entryDate: bill.billDate,
            createdBy: userData.id || userData._id,
            creatorRole: userData.role
        });
    }

    // 3. Create one entry for the total (Credit Accounts Payable)
    await LedgerService.create({
        branch: extractId(bill.branch),
        accountingCode: apAccount._id,
        type: "CREDIT",
        amount: bill.totalAmount,
        description: `Bill ${bill.billNumber} - Total Liability`,
        entryDate: bill.billDate,
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    });
}

exports.getAllBills = async (query = {}) => {
    const cleanedQuery = { ...query };
    delete cleanedQuery.limit;
    delete cleanedQuery.page;
    return await BillRepo.getAllBills(cleanedQuery);
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

        // Update bill balance
        bill.amountPaid += payment.totalAmount;
        if (bill.balanceDue <= 0) {
            bill.status = "PAID";
        } else {
            bill.status = "PARTIALLY_PAID";
        }
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
            const itemName = getRowVal(r, ["Description", "description", "Item Name", "itemName"]) || "No Item Details";
            const qty = Number(getRowVal(r, ["Quantity", "quantity"])) || 1;
            const unitPrice = Number(getRowVal(r, ["Rate", "rate", "Item Price", "itemPrice", "Unit Price", "unitPrice"])) || 0;
            const itemDesc = getRowVal(r, ["Description", "description"]) || "";

            const accCodeVal = getRowVal(r, ["Account Code", "accountCode"]);
            const accNameVal = getRowVal(r, ["Account", "accountName", "account"]);

            let accountId = null;
            if (accCodeVal) {
                const codeStr = accCodeVal.toString().trim().toLowerCase();
                const accDoc = accountsByCode.get(codeStr);
                if (accDoc) accountId = accDoc._id;
            }
            if (!accountId && accNameVal) {
                const nameStr = accNameVal.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                const accDoc = accountsByName.get(nameStr);
                if (accDoc) accountId = accDoc._id;
            }

            // Collect unmapped line-item fields
            const usageUnit = getRowVal(r, ["Usage unit", "usageUnit"]);
            const taxAmountItem = getRowVal(r, ["Tax Amount", "taxAmount"]);
            const itemTotal = getRowVal(r, ["Item Total", "itemTotal"]);
            const isBillable = getRowVal(r, ["Is Billable", "isBillable"]);
            const itemLocName = getRowVal(r, ["Line Item Location Name", "lineItemLocationName"]);
            const discountType = getRowVal(r, ["Discount Type", "discountType"]);
            const isDiscountBeforeTax = getRowVal(r, ["Is Discount Before Tax", "isDiscountBeforeTax"]);
            const discount = getRowVal(r, ["Discount", "discount"]);
            const discountAmount = getRowVal(r, ["Discount Amount", "discountAmount"]);
            const billReceiveStatus = getRowVal(r, ["Bill Receive Status", "billReceiveStatus"]);
            const manuallyReceivedQty = getRowVal(r, ["Manually Received Quantity", "manuallyReceivedQuantity"]);
            const taxIDItem = getRowVal(r, ["Tax ID", "taxId"]);
            const taxNameItem = getRowVal(r, ["Tax Name", "taxName"]);
            const taxPctItem = getRowVal(r, ["Tax Percentage", "taxPercentage"]);
            const taxTypeItem = getRowVal(r, ["Tax Type", "taxType"]);
            const entityDiscountAmt = getRowVal(r, ["Entity Discount Amount", "entityDiscountAmount"]);
            const discountAccount = getRowVal(r, ["Discount Account", "discountAccount"]);
            const isLandedCost = getRowVal(r, ["Is Landed Cost", "isLandedCost"]);

            let descParts = [];
            if (itemDesc) descParts.push(itemDesc);

            const unmappedItemFields = {
                "Usage Unit": usageUnit,
                "Tax Amount": taxAmountItem,
                "Item Total": itemTotal,
                "Is Billable": isBillable,
                "Line Item Location": itemLocName,
                "Discount Type": discountType,
                "Is Discount Before Tax": isDiscountBeforeTax,
                "Discount": discount,
                "Discount Amount": discountAmount,
                "Bill Receive Status": billReceiveStatus,
                "Manually Received Quantity": manuallyReceivedQty,
                "Tax ID": taxIDItem,
                "Tax Name": taxNameItem,
                "Tax Percentage": taxPctItem,
                "Tax Type": taxTypeItem,
                "Entity Discount Amount": entityDiscountAmt,
                "Discount Account": discountAccount,
                "Is Landed Cost": isLandedCost
            };

            for (const [k, v] of Object.entries(unmappedItemFields)) {
                if (v !== undefined && v !== null && v !== "") {
                    descParts.push(`${k}: ${v}`);
                }
            }

            items.push({
                itemName,
                quantity: qty,
                unitPrice,
                description: descParts.join(" | "),
                accountId
            });

            calculatedTotal += qty * unitPrice;
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

        // If bill already exists, append new items
        if (existingBill) {
            try {
                existingBill.items.push(...items);
                existingBill.totalAmount = (existingBill.totalAmount || 0) + calculatedTotal;
                existingBill.isInclusiveTax = isInclusiveTax;
                if (taxId) {
                    existingBill.taxId = taxId;
                    existingBill.taxPercentage = taxPercentage;
                }
                await existingBill.save();
                updatedBills.push(existingBill.billNumber);
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
        const billType = getRowVal(headerRow, ["Bill Type", "billType"]);
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
            "Bill Type": billType,
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
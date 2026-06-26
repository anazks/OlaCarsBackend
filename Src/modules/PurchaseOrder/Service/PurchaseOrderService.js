const PurchaseOrder = require('../Model/PurchaseOrderModel.js');
const Branch = require('../../Branch/Model/BranchModel');
const Supplier = require('../../Supplier/Model/SupplierModel');
const AccountingCode = require('../../AccountingCode/Model/AccountingCodeModel');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = [
    'purchaseOrderNumber', 'items', 'totalAmount',
    'purchaseOrderDate', 'paymentDate', 'branch', 'supplier', 'description'
];
const ALLOWED_UPDATE_FIELDS = ['items', 'totalAmount', 'paymentDate', 'supplier', 'description'];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newPO = await PurchaseOrder.create(filtered);
    return newPO.toObject();
};

exports.getAll = async (query = {}) => {
    return await PurchaseOrder.find(query)
        .populate('branch')
        .populate('supplier', 'name contactPerson email');
};

exports.getById = async (id) => {
    return await PurchaseOrder.findById(id)
        .populate('branch')
        .populate('supplier', 'name contactPerson email')
        .populate('createdBy', 'name email');
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await PurchaseOrder.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Purchase Order not found', 404);
    return updated;
};

exports.updateStatus = async (id, status, approvedBy, approverRole) => {
    const updated = await PurchaseOrder.findByIdAndUpdate(
        id,
        { status, approvedBy, approverRole },
        { new: true }
    );
    if (!updated) throw new AppError('Purchase Order not found', 404);
    return updated;
};

exports.bulkUploadPurchaseOrders = async (rows, actor, userBranchId) => {
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

    const createdPOs = [];
    const errors = [];
    const skipped = [];
    const updatedPOs = [];

    const poGroups = new Map();
    let rowCounter = 0;
    for (const row of rows) {
        rowCounter++;
        const poNum = getRowVal(row, ["Purchase Order Number", "purchaseOrderNumber"]);
        const poId = getRowVal(row, ["Purchase Order ID", "purchaseOrderId"]);
        const key = (poNum || poId || `TEMP-${Date.now()}-${rowCounter}`).toString().trim();
        if (!poGroups.has(key)) {
            poGroups.set(key, []);
        }
        poGroups.get(key).push({ row, originalIndex: rowCounter });
    }

    for (const [key, grouped] of poGroups.entries()) {
        const headerRowObj = grouped[0];
        const headerRow = headerRowObj.row;
        const origIdx = headerRowObj.originalIndex;

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


        const locationId = getRowVal(headerRow, ["Location ID", "locationId"]);
        const locationName = getRowVal(headerRow, ["Location Name", "locationName", "Location", "location"]);
        const lineItemLocationName = getRowVal(headerRow, ["Line Item Location Name", "lineItemLocationName"]);
        const countryVal = getRowVal(headerRow, ["Country", "country"]);

        let branchDoc = null;
        if (locationId) {
            const cleanId = locationId.toString().trim();
            branchDoc = branchesById.get(cleanId) || branchesByCode.get(cleanId.toLowerCase());
        }
        if (!branchDoc && locationName) {
            const cleanLocName = locationName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            branchDoc = branchesByName.get(cleanLocName);
        }
        if (!branchDoc && lineItemLocationName) {
            const cleanLineLocName = lineItemLocationName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            branchDoc = branchesByName.get(cleanLineLocName);
        }
        if (!branchDoc && countryVal) {
            const cleanCountry = countryVal.toString().trim().toLowerCase();
            branchDoc = branchesList.find(b => b.country && b.country.trim().toLowerCase() === cleanCountry);
        }
        if (!branchDoc && userBranchId) {
            branchDoc = branchesById.get(userBranchId.toString());
        }
        if (!branchDoc) {
            branchDoc = branchesList.find(b => b.status === "ACTIVE") || branchesList[0];
        }

        if (!branchDoc) {
            errors.push(`Purchase Order "${key}" (Row ${origIdx}): Location / Branch could not be resolved.`);
            continue;
        }

        const existingPO = await PurchaseOrder.findOne({ purchaseOrderNumber: key });

        const items = [];
        let calculatedTotal = 0;

        for (const itemObj of grouped) {
            const r = itemObj.row;
            const itemName = getRowVal(r, ["Item Name", "itemName"]) || "No Item Details";

            const qty = Number(getRowVal(r, ["QuantityOrdered", "quantityOrdered", "Quantity", "quantity"])) || 1;
            const unitPrice = Number(getRowVal(r, ["Item Price", "itemPrice"])) || 0;
            const itemDesc = getRowVal(r, ["Item Desc", "itemDesc", "Description", "description"]) || "";

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

            const productID = getRowVal(r, ["Product ID", "productId"]);
            const qtyCancelled = getRowVal(r, ["QuantityCancelled", "quantityCancelled"]);
            const qtyReceived = getRowVal(r, ["QuantityReceived", "quantityReceived"]);
            const qtyBilled = getRowVal(r, ["QuantityBilled", "quantityBilled"]);
            const usageUnit = getRowVal(r, ["Usage unit", "usageUnit"]);
            const itemLocName = getRowVal(r, ["Line Item Location Name", "lineItemLocationName"]);
            const discountType = getRowVal(r, ["Discount Type", "discountType"]);
            const isDiscountBeforeTax = getRowVal(r, ["Is Discount Before Tax", "isDiscountBeforeTax"]);
            const discount = getRowVal(r, ["Discount", "discount"]);
            const discountAmount = getRowVal(r, ["Discount Amount", "discountAmount"]);
            const taxID = getRowVal(r, ["Tax ID", "taxId"]);
            const itemTax = getRowVal(r, ["Item Tax", "itemTax"]);
            const itemTaxPct = getRowVal(r, ["Item Tax %", "itemTaxPct"]);
            const itemTaxAmt = getRowVal(r, ["Item Tax Amount", "itemTaxAmount"]);
            const itemTaxType = getRowVal(r, ["Item Tax Type", "itemTaxType"]);
            const itemTotal = getRowVal(r, ["Item Total", "itemTotal"]);

            let descParts = [];
            if (itemDesc) descParts.push(itemDesc);
            
            const unmappedItemFields = {
                "Product ID": productID,
                "Quantity Cancelled": qtyCancelled,
                "Quantity Received": qtyReceived,
                "Quantity Billed": qtyBilled,
                "Usage Unit": usageUnit,
                "Line Item Location": itemLocName,
                "Discount Type": discountType,
                "Is Discount Before Tax": isDiscountBeforeTax,
                "Discount": discount,
                "Discount Amount": discountAmount,
                "Tax ID": taxID,
                "Item Tax": itemTax,
                "Item Tax %": itemTaxPct,
                "Item Tax Amount": itemTaxAmt,
                "Item Tax Type": itemTaxType,
                "Item Total": itemTotal
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
            errors.push(`Purchase Order "${key}" (Row ${origIdx}): No valid items found.`);
            continue;
        }

        // If PO already exists in DB, append the new items to it
        if (existingPO) {
            try {
                existingPO.items.push(...items);
                existingPO.totalAmount = (existingPO.totalAmount || 0) + calculatedTotal;
                await existingPO.save();
                updatedPOs.push(existingPO.purchaseOrderNumber);
            } catch (err) {
                errors.push(`Purchase Order "${key}" (Row ${origIdx}): Failed to update existing PO - ${err.message}`);
            }
            continue;
        }

        const rawDate = getRowVal(headerRow, ["Purchase Order Date", "purchaseOrderDate"]);
        const purchaseOrderDate = parseFlexibleDate(rawDate) || new Date();

        const rawPaymentDate = getRowVal(headerRow, ["Delivery Date", "deliveryDate", "Payment Date", "paymentDate"]);
        const paymentDate = parseFlexibleDate(rawPaymentDate) || undefined;

        const rawStatus = (getRowVal(headerRow, ["Purchase Order Status", "status", "statusLabel"]) || "WAITING").toString().trim().toLowerCase();
        let status = "WAITING";
        let isBilled = false;

        if (rawStatus === "billed") {
            status = "APPROVED";
            isBilled = true;
        } else if (rawStatus === "issues" || rawStatus === "issued") {
            status = "APPROVED";
        } else if (rawStatus === "draft") {
            status = "WAITING";
        } else {
            const statusMap = {
                "requested": "REQUESTED",
                "manager_approved": "MANAGER_APPROVED",
                "waiting": "WAITING",
                "approved": "APPROVED",
                "rejected": "REJECTED",
                "disposed": "DISPOSED",
                "pending_finance_approval": "PENDING_FINANCE_APPROVAL",
                "received": "RECEIVED"
            };
            if (statusMap[rawStatus]) {
                status = statusMap[rawStatus];
            }
        }

        const deliveryDate = getRowVal(headerRow, ["Delivery Date", "deliveryDate"]);
        const refNum1 = getRowVal(headerRow, ["Reference#", "referenceNumber"]);
        const refNum2 = getRowVal(headerRow, ["Reference No", "referenceNo"]);
        const isInclusiveTax = getRowVal(headerRow, ["Is Inclusive Tax", "isInclusiveTax"]);
        const currencyCode = getRowVal(headerRow, ["Currency Code", "currencyCode"]);
        const exchangeRate = getRowVal(headerRow, ["Exchange Rate", "exchangeRate"]);
        const templateName = getRowVal(headerRow, ["Template Name", "templateName"]);
        const totalVal = getRowVal(headerRow, ["Total", "total"]);
        const adjustment = getRowVal(headerRow, ["Adjustment", "adjustment"]);
        const adjustmentDesc = getRowVal(headerRow, ["Adjustment Description", "adjustmentDescription"]);
        const entityDiscountPercent = getRowVal(headerRow, ["Entity Discount Percent", "entityDiscountPercent"]);
        const entityDiscountAmount = getRowVal(headerRow, ["Entity Discount Amount", "entityDiscountAmount"]);
        const paymentTerms = getRowVal(headerRow, ["Payment Terms", "paymentTerms"]);
        const paymentTermsLabel = getRowVal(headerRow, ["Payment Terms Label", "paymentTermsLabel"]);
        const attention = getRowVal(headerRow, ["Attention", "attention"]);
        const country = getRowVal(headerRow, ["Country", "country"]);

        let docDescParts = [];
        const unmappedDocFields = {
            "Delivery Date": deliveryDate,
            "Reference#": refNum1,
            "Reference No": refNum2,
            "Is Inclusive Tax": isInclusiveTax,
            "Currency Code": currencyCode,
            "Exchange Rate": exchangeRate,
            "Template Name": templateName,
            "Total": totalVal,
            "Adjustment": adjustment,
            "Adjustment Description": adjustmentDesc,
            "Entity Discount Percent": entityDiscountPercent,
            "Entity Discount Amount": entityDiscountAmount,
            "Payment Terms": paymentTerms,
            "Payment Terms Label": paymentTermsLabel,
            "Attention": attention,
            "Country": country
        };

        for (const [k, v] of Object.entries(unmappedDocFields)) {
            if (v !== undefined && v !== null && v !== "") {
                docDescParts.push(`${k}: ${v}`);
            }
        }

        if (!supplierDoc) {
            if (vendorName) docDescParts.push(`Vendor Name: ${vendorName}`);
            if (vendorNumber) docDescParts.push(`Vendor Number: ${vendorNumber}`);
        }

        const newPOData = {
            purchaseOrderNumber: key,
            status,
            purpose: "Others",
            items,
            totalAmount: calculatedTotal,
            originalTotalAmount: calculatedTotal,
            purchaseOrderDate,
            paymentDate,
            branch: branchDoc._id,
            supplier: supplierDoc ? supplierDoc._id : undefined,
            isBilled,
            description: docDescParts.join(" | "),
            createdBy: actor.id,
            creatorRole: actor.role
        };

        try {
            const created = await PurchaseOrder.create(newPOData);
            createdPOs.push(created);
        } catch (err) {
            errors.push(`Purchase Order "${key}" (Row ${origIdx}): Failed to create - ${err.message}`);
        }
    }

    return {
        successCount: createdPOs.length,
        updatedCount: updatedPOs.length,
        errorCount: errors.length,
        skippedCount: skipped.length,
        errors,
        skipped,
        createdPOs: createdPOs.map(po => po.purchaseOrderNumber),
        updatedPOs
    };
};


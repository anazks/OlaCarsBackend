with open(r"c:\Users\anton\OneDrive\Documents\vs coding\OlaCarsBackend\Src\modules\Bill\Service\BillService.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

header_part = "".join(lines[:286])

new_bulk_upload = """exports.bulkUploadBills = async (rows, actor, userBranchId) => {
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
"""

with open(r"c:\Users\anton\OneDrive\Documents\vs coding\OlaCarsBackend\Src\modules\Bill\Service\BillService.js", "w", encoding="utf-8") as f:
    f.write(header_part + new_bulk_upload)

print("SUCCESSFULLY REWRITTEN BILL SERVICE!")

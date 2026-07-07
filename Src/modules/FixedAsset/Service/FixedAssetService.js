const mongoose = require("mongoose");
const FixedAsset = require("../Model/FixedAssetModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const Bill = require("../../Bill/Model/BillModel");
const PurchaseOrder = require("../../PurchaseOrder/Model/PurchaseOrderModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const AppError = require("../../../shared/utils/AppError");

// Helper to calculate Straight-line depreciation schedule
function calculateDepreciationSchedule(params) {
    const cost = Number(params.purchasePrice || params.purchaseValue || 0);
    const salvage = Number(params.disposalValue !== undefined ? params.disposalValue : (params.residualValue || 0));
    
    // Calculate useful life in years
    let years = Number(params.usefulLifeYears || 5);
    if (params.assetLife && params.assetLifeUnit) {
        if (params.assetLifeUnit === "Months") {
            years = Number(params.assetLife) / 12;
        } else {
            years = Number(params.assetLife);
        }
    }
    
    const depreciableAmount = cost - salvage;
    const interval = params.depreciationInterval || params.depreciationFrequency || "Monthly";

    if (depreciableAmount <= 0 || years <= 0) {
        return [];
    }

    const schedule = [];
    let accumulatedDepreciation = 0;
    let startDate = new Date();
    if (params.depreciationStartDate && !isNaN(new Date(params.depreciationStartDate).getTime())) {
        startDate = new Date(params.depreciationStartDate);
    } else if (params.purchaseDate && !isNaN(new Date(params.purchaseDate).getTime())) {
        startDate = new Date(params.purchaseDate);
    }

    if (interval === "Yearly") {
        const annualDepreciation = Number((depreciableAmount / years).toFixed(2));
        const totalPeriods = Math.ceil(years);
        for (let i = 1; i <= totalPeriods; i++) {
            let depAmount = annualDepreciation;
            if (i === totalPeriods) {
                depAmount = Number((depreciableAmount - accumulatedDepreciation).toFixed(2));
            }
            accumulatedDepreciation = Number((accumulatedDepreciation + depAmount).toFixed(2));
            const bookValue = Number((cost - accumulatedDepreciation).toFixed(2));

            // Enforce last day of target year (December 31) in UTC
            const periodDate = new Date(Date.UTC(startDate.getUTCFullYear() + i - 1, 11, 31, 12, 0, 0, 0));

            schedule.push({
                periodIndex: i,
                periodDate,
                depreciationAmount: depAmount,
                accumulatedDepreciation,
                bookValue,
                status: "Pending",
            });
        }
    } else {
        // Monthly
        const totalMonths = Math.ceil(years * 12);
        const monthlyDepreciation = Number((depreciableAmount / totalMonths).toFixed(2));
        for (let i = 1; i <= totalMonths; i++) {
            let depAmount = monthlyDepreciation;
            if (i === totalMonths) {
                depAmount = Number((depreciableAmount - accumulatedDepreciation).toFixed(2));
            }
            accumulatedDepreciation = Number((accumulatedDepreciation + depAmount).toFixed(2));
            const bookValue = Number((cost - accumulatedDepreciation).toFixed(2));

            // Enforce last day of the target monthly period in UTC
            const periodDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 0, 12, 0, 0, 0));

            schedule.push({
                periodIndex: i,
                periodDate,
                depreciationAmount: depAmount,
                accumulatedDepreciation,
                bookValue,
                status: "Pending",
            });
        }
    }

    return schedule;
}

// Helper to look up or create special accounts requested by user
async function getOrCreateSpecialAccounts(isVehicle = false, userData = { id: null, role: "ADMIN" }) {
    const defaultCreator = userData.id || userData._id || "507f1f77bcf86cd799439011"; // Fallback Admin ObjectId if not provided
    const defaultRole = userData.role || "ADMIN";

    let fixedAssetAccount = null;
    let accumulatedDepreciationAccount = null;
    let depreciationExpenseAccount = null;

    if (isVehicle) {
        // 1. Accumulated Depreciation of Vehicles Account
        const accumName = "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos";
        accumulatedDepreciationAccount = await AccountingCode.findOne({ name: accumName, isDeleted: false });
        if (!accumulatedDepreciationAccount) {
            console.log(`[FixedAssetService] Seeding vehicle accumulated depreciation account: "${accumName}"`);
            accumulatedDepreciationAccount = await AccountingCode.create({
                code: "1210-VEH-DEP",
                name: accumName,
                category: "ASSET",
                accountType: "fixed asset",
                description: "Contra-asset account for vehicle accumulated depreciation",
                currency: "USD",
                createdBy: defaultCreator,
                creatorRole: defaultRole
            });
        }

        // 2. Depreciation Expense Account
        const expenseName = "DEPRECIATION OF VEHICLES";
        depreciationExpenseAccount = await AccountingCode.findOne({ name: expenseName, isDeleted: false });
        if (!depreciationExpenseAccount) {
            console.log(`[FixedAssetService] Seeding vehicle depreciation expense account: "${expenseName}"`);
            depreciationExpenseAccount = await AccountingCode.create({
                code: "5010-VEH-DEP",
                name: expenseName,
                category: "EXPENSE",
                accountType: "expense",
                description: "Depreciation expense for vehicles",
                currency: "USD",
                createdBy: defaultCreator,
                creatorRole: defaultRole
            });
        }

        // 3. Vehicles Fixed Asset Account
        const assetName = "Vehicles/Vehículos";
        fixedAssetAccount = await AccountingCode.findOne({ name: /vehicles/i, category: "ASSET", accountType: "fixed asset", isDeleted: false });
        if (!fixedAssetAccount) {
            console.log(`[FixedAssetService] Seeding vehicles fixed asset account: "${assetName}"`);
            fixedAssetAccount = await AccountingCode.create({
                code: "1200-VEH",
                name: assetName,
                category: "ASSET",
                accountType: "fixed asset",
                description: "Fixed asset account for vehicles",
                currency: "USD",
                createdBy: defaultCreator,
                creatorRole: defaultRole
            });
        }
    } else {
        // General Fixed Asset
        fixedAssetAccount = await AccountingCode.findOne({ category: "ASSET", accountType: "fixed asset", isDeleted: false });
        if (!fixedAssetAccount) {
            fixedAssetAccount = await AccountingCode.create({
                code: "1200-GEN",
                name: "General Fixed Assets",
                category: "ASSET",
                accountType: "fixed asset",
                description: "General fixed asset account",
                currency: "USD",
                createdBy: defaultCreator,
                creatorRole: defaultRole
            });
        }

        accumulatedDepreciationAccount = await AccountingCode.findOne({ name: /Accumulated Depreciation/i, isDeleted: false })
            || await AccountingCode.findOne({ code: /1210/i, isDeleted: false });
        if (!accumulatedDepreciationAccount) {
            accumulatedDepreciationAccount = await AccountingCode.create({
                code: "1210-GEN-DEP",
                name: "Accumulated Depreciation of General Assets",
                category: "ASSET",
                accountType: "fixed asset",
                description: "Contra-asset account for general accumulated depreciation",
                currency: "USD",
                createdBy: defaultCreator,
                creatorRole: defaultRole
            });
        }

        depreciationExpenseAccount = await AccountingCode.findOne({ name: /Depreciation Expense/i, isDeleted: false })
            || await AccountingCode.findOne({ category: "EXPENSE", name: /depreciation/i, isDeleted: false });
        if (!depreciationExpenseAccount) {
            depreciationExpenseAccount = await AccountingCode.create({
                code: "5010-GEN-DEP",
                name: "Depreciation Expense",
                category: "EXPENSE",
                accountType: "expense",
                description: "Depreciation expense account",
                currency: "USD",
                createdBy: defaultCreator,
                creatorRole: defaultRole
            });
        }
    }

    return {
        fixedAssetAccount: fixedAssetAccount._id,
        accumulatedDepreciationAccount: accumulatedDepreciationAccount._id,
        depreciationExpenseAccount: depreciationExpenseAccount._id
    };
}

// 1. Manually calculate depreciation schedule preview
exports.previewDepreciationSchedule = async (params) => {
    return calculateDepreciationSchedule(params);
};

// 2. Create Fixed Asset Manually
exports.createFixedAsset = async (data, userData) => {
    // Normalize creatorRole to uppercase enum
    let finalCreatorRole = (userData.role || "ADMIN").toUpperCase();
    if (finalCreatorRole === "FINANCE-ADMIN" || finalCreatorRole === "FINANCIAL-ADMIN" || finalCreatorRole === "FINANCIALADMIN") {
        finalCreatorRole = "FINANCEADMIN";
    } else if (finalCreatorRole === "OPERATION-ADMIN" || finalCreatorRole === "OPERATIONALADMIN" || finalCreatorRole === "OPERATIONAL-ADMIN") {
        finalCreatorRole = "OPERATIONADMIN";
    }
    const { ROLES } = require("../../../shared/constants/roles");
    if (!Object.values(ROLES).includes(finalCreatorRole)) {
        finalCreatorRole = "ADMIN";
    }

    const generatedCode = data.code || `FA-${Date.now()}`;
    
    // Resolve fixedAssetType if passed as string name
    let resolvedType = data.fixedAssetType;
    if (resolvedType && typeof resolvedType === "string" && !mongoose.Types.ObjectId.isValid(resolvedType)) {
        const FixedAssetType = require("../Model/FixedAssetTypeModel");
        const match = await FixedAssetType.findOne({ name: { $regex: new RegExp(`^${resolvedType.trim()}$`, "i") } });
        if (match) {
            resolvedType = match._id;
        } else {
            resolvedType = undefined;
        }
    }

    const newAsset = new FixedAsset({
        ...data,
        fixedAssetType: resolvedType,
        code: generatedCode,
        createdBy: userData.id || userData._id,
        creatorRole: finalCreatorRole,
    });

    if (newAsset.status === "Active") {
        newAsset.depreciationSchedule = calculateDepreciationSchedule(newAsset);
    }

    await newAsset.save();
    return newAsset;
};

// 3. Update Fixed Asset
exports.updateFixedAsset = async (id, data, userData) => {
    const asset = await FixedAsset.findById(id);
    if (!asset) throw new AppError("Fixed Asset not found", 404);

    // Resolve fixedAssetType if passed as string name
    if (data.fixedAssetType !== undefined) {
        let resolvedType = data.fixedAssetType;
        if (resolvedType && typeof resolvedType === "string" && !mongoose.Types.ObjectId.isValid(resolvedType)) {
            const FixedAssetType = require("../Model/FixedAssetTypeModel");
            const match = await FixedAssetType.findOne({ name: { $regex: new RegExp(`^${resolvedType.trim()}$`, "i") } });
            if (match) {
                resolvedType = match._id;
            } else {
                resolvedType = undefined;
            }
        }
        data.fixedAssetType = resolvedType;
    }

    // Apply updates
    Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
            asset[key] = data[key];
        }
    });

    // If active and schedule is empty, generate it
    if (asset.status === "Active" && (!asset.depreciationSchedule || asset.depreciationSchedule.length === 0)) {
        asset.depreciationSchedule = calculateDepreciationSchedule(asset);
    }

    await asset.save();
    return asset;
};

// 4. Get Fixed Assets
exports.getFixedAssets = async (query = {}) => {
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
        filter.$or = [
            { name: new RegExp(query.search, "i") },
            { code: new RegExp(query.search, "i") }
        ];
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 25;
    const skip = (page - 1) * limit;

    const total = await FixedAsset.countDocuments(filter);
    const docs = await FixedAsset.find(filter)
        .select("-depreciationSchedule")
        .populate("fixedAssetType", "name description isActive")
        .populate("fixedAssetAccount", "code name")
        .populate("accumulatedDepreciationAccount", "code name")
        .populate("depreciationExpenseAccount", "code name")
        .populate("linkedVehicle", "basicDetails.make basicDetails.model basicDetails.year legalDocs.registrationNumber")
        .populate("originalBill", "billNumber")
        .populate("originalPO", "purchaseOrderNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    
    return {
        docs,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
    };
};

// 5. Get Fixed Asset By ID
exports.getFixedAssetById = async (id) => {
    const asset = await FixedAsset.findById(id)
        .populate("fixedAssetType", "name description isActive")
        .populate("fixedAssetAccount", "code name")
        .populate("accumulatedDepreciationAccount", "code name")
        .populate("depreciationExpenseAccount", "code name")
        .populate("linkedVehicle")
        .populate("originalBill")
        .populate("originalPO");

    if (!asset) throw new AppError("Fixed Asset not found", 404);
    return asset;
};

// 6. Delete Fixed Asset
exports.deleteFixedAsset = async (id) => {
    const asset = await FixedAsset.findByIdAndDelete(id);
    if (!asset) throw new AppError("Fixed Asset not found", 404);
    return asset;
};

// 7. Auto-create Draft Fixed Assets when a Bill is Paid
exports.autoCreateDraftAssetsFromBill = async (billId, userData) => {
    try {
        console.log(`[FixedAssetService] Checking paid bill ${billId} for fixed assets...`);
        const billDoc = await Bill.findById(billId).populate("items.accountId");
        if (!billDoc) return;

        for (const item of billDoc.items) {
            const accCode = item.accountId;
            if (accCode && accCode.category === "ASSET" && accCode.accountType && accCode.accountType.toLowerCase() === "fixed asset") {
                // Determine if vehicle
                const isVehicle = accCode.name.toLowerCase().includes("vehicle") 
                    || accCode.name.toLowerCase().includes("vehículo") 
                    || item.itemName.toLowerCase().includes("car") 
                    || item.itemName.toLowerCase().includes("vehicle");

                const specialAccounts = await getOrCreateSpecialAccounts(isVehicle, userData);

                // Check for linked vehicle via PO
                let linkedVehicleId = null;
                if (billDoc.purchaseOrder) {
                    const vehicle = await Vehicle.findOne({ "purchaseDetails.purchaseOrder": billDoc.purchaseOrder });
                    if (vehicle) linkedVehicleId = vehicle._id;
                }

                // Check if already created from the same bill
                let existing = await FixedAsset.findOne({ originalBill: billId, name: item.itemName });
                if (existing) continue;

                // Also check if already created from the linked PO
                if (billDoc.purchaseOrder) {
                    existing = await FixedAsset.findOne({ originalPO: billDoc.purchaseOrder, name: item.itemName });
                    if (existing) {
                        // Link this existing asset to the new bill as well!
                        existing.originalBill = billId;
                        if (!existing.linkedVehicle && linkedVehicleId) {
                            existing.linkedVehicle = linkedVehicleId;
                        }
                        await existing.save();
                        console.log(`[FixedAssetService] Linked existing PO fixed asset (${existing.code}) to Bill: ${billDoc.billNumber}`);
                        continue;
                    }
                }

                console.log(`[FixedAssetService] Creating draft fixed asset for item: ${item.itemName} from Bill: ${billDoc.billNumber}`);
                await FixedAsset.create({
                    name: item.itemName,
                    code: `FA-BILL-${billDoc.billNumber.replace("BILL-", "")}-${Math.floor(Math.random() * 1000)}`,
                    purchaseDate: billDoc.billDate || new Date(),
                    purchasePrice: item.unitPrice * item.quantity,
                    residualValue: 0,
                    usefulLifeYears: 5,
                    depreciationMethod: "Straight-Line",
                    depreciationInterval: "Monthly",
                    status: "Draft",
                    fixedAssetAccount: accCode._id,
                    accumulatedDepreciationAccount: specialAccounts.accumulatedDepreciationAccount,
                    depreciationExpenseAccount: specialAccounts.depreciationExpenseAccount,
                    originalBill: billId,
                    originalPO: billDoc.purchaseOrder || null,
                    linkedVehicle: linkedVehicleId,
                    createdBy: userData.id || userData._id || billDoc.createdBy,
                    creatorRole: (() => {
                        let role = (userData.role || billDoc.creatorRole || "ADMIN").toUpperCase();
                        if (role === "FINANCE-ADMIN" || role === "FINANCIAL-ADMIN" || role === "FINANCIALADMIN") role = "FINANCEADMIN";
                        else if (role === "OPERATION-ADMIN" || role === "OPERATIONALADMIN" || role === "OPERATIONAL-ADMIN") role = "OPERATIONADMIN";
                        const { ROLES } = require("../../../shared/constants/roles");
                        return Object.values(ROLES).includes(role) ? role : "ADMIN";
                    })()
                });
            }
        }
    } catch (err) {
        console.error(`[FixedAssetService] Failed to auto-create asset from bill:`, err);
    }
};

// 8. Auto-create Draft Fixed Assets when a PO is Received
exports.autoCreateDraftAssetsFromPO = async (poId, userData) => {
    try {
        console.log(`[FixedAssetService] Checking received PO ${poId} for fixed assets...`);
        const poDoc = await PurchaseOrder.findById(poId).populate("items.accountId");
        if (!poDoc) return;

        for (const item of poDoc.items) {
            const accCode = item.accountId;
            if (accCode && accCode.category === "ASSET" && accCode.accountType && accCode.accountType.toLowerCase() === "fixed asset") {
                // Check if already created
                const existing = await FixedAsset.findOne({ originalPO: poId, name: item.itemName });
                if (existing) continue;

                // Determine if vehicle
                const isVehicle = accCode.name.toLowerCase().includes("vehicle") 
                    || accCode.name.toLowerCase().includes("vehículo") 
                    || item.itemName.toLowerCase().includes("car") 
                    || item.itemName.toLowerCase().includes("vehicle")
                    || poDoc.purpose === "Vehicle";

                const specialAccounts = await getOrCreateSpecialAccounts(isVehicle, userData);

                // Find linked vehicle
                const vehicle = await Vehicle.findOne({ "purchaseDetails.purchaseOrder": poId });
                const linkedVehicleId = vehicle ? vehicle._id : null;

                console.log(`[FixedAssetService] Creating draft fixed asset for item: ${item.itemName} from PO: ${poDoc.purchaseOrderNumber}`);
                await FixedAsset.create({
                    name: item.itemName,
                    code: `FA-PO-${poDoc.purchaseOrderNumber.replace("PO-", "")}-${Math.floor(Math.random() * 1000)}`,
                    purchaseDate: poDoc.purchaseOrderDate || new Date(),
                    purchasePrice: item.unitPrice * item.quantity,
                    residualValue: 0,
                    usefulLifeYears: 5,
                    depreciationMethod: "Straight-Line",
                    depreciationInterval: "Monthly",
                    status: "Draft",
                    fixedAssetAccount: accCode._id,
                    accumulatedDepreciationAccount: specialAccounts.accumulatedDepreciationAccount,
                    depreciationExpenseAccount: specialAccounts.depreciationExpenseAccount,
                    originalPO: poId,
                    linkedVehicle: linkedVehicleId,
                    createdBy: userData.id || userData._id || poDoc.createdBy,
                    creatorRole: (() => {
                        let role = (userData.role || poDoc.creatorRole || "ADMIN").toUpperCase();
                        if (role === "FINANCE-ADMIN" || role === "FINANCIAL-ADMIN" || role === "FINANCIALADMIN") role = "FINANCEADMIN";
                        else if (role === "OPERATION-ADMIN" || role === "OPERATIONALADMIN" || role === "OPERATIONAL-ADMIN") role = "OPERATIONADMIN";
                        const { ROLES } = require("../../../shared/constants/roles");
                        return Object.values(ROLES).includes(role) ? role : "ADMIN";
                    })()
                });
            }
        }
    } catch (err) {
        console.error(`[FixedAssetService] Failed to auto-create asset from PO:`, err);
    }
};

// 9. Post Depreciation schedule entry to Ledger
exports.postDepreciationPeriod = async (assetId, periodIndex, userData) => {
    const asset = await FixedAsset.findById(assetId);
    if (!asset) throw new AppError("Fixed Asset not found", 404);

    if (asset.status !== "Active") {
        throw new AppError("Depreciation can only be posted for Active assets.", 400);
    }

    const scheduleEntry = asset.depreciationSchedule.find(entry => entry.periodIndex === Number(periodIndex));
    if (!scheduleEntry) throw new AppError("Depreciation period not found in schedule.", 404);

    if (scheduleEntry.status === "Posted") {
        throw new AppError("This depreciation period has already been posted.", 400);
    }

    // Resolve branch ID for entries
    let branchId = undefined;
    if (asset.linkedVehicle) {
        const vehicle = await Vehicle.findById(asset.linkedVehicle);
        if (vehicle && vehicle.purchaseDetails && vehicle.purchaseDetails.branch) {
            branchId = vehicle.purchaseDetails.branch;
        }
    }
    if (!branchId && asset.location) {
        const Branch = require("../../Branch/Model/BranchModel");
        const branchDoc = await Branch.findOne({ name: asset.location });
        if (branchDoc) {
            branchId = branchDoc._id;
        }
    }

    // Normalize creatorRole to uppercase enum
    let finalCreatorRole = (userData.role || "ADMIN").toUpperCase();
    if (finalCreatorRole === "FINANCE-ADMIN" || finalCreatorRole === "FINANCIAL-ADMIN" || finalCreatorRole === "FINANCIALADMIN") {
        finalCreatorRole = "FINANCEADMIN";
    } else if (finalCreatorRole === "OPERATION-ADMIN" || finalCreatorRole === "OPERATIONALADMIN" || finalCreatorRole === "OPERATIONAL-ADMIN") {
        finalCreatorRole = "OPERATIONADMIN";
    }
    const { ROLES } = require("../../../shared/constants/roles");
    if (!Object.values(ROLES).includes(finalCreatorRole)) {
        finalCreatorRole = "ADMIN";
    }

    // 1. Post DEBIT Depreciation Expense Account (Increases Expense)
    const debitEntry = await LedgerService.create({
        branch: branchId || undefined,
        accountingCode: asset.depreciationExpenseAccount,
        type: "DEBIT",
        amount: scheduleEntry.depreciationAmount,
        description: `Depreciation - Debit Expense [Asset: ${asset.name} (${asset.code}), Period #${scheduleEntry.periodIndex}]`,
        entryDate: scheduleEntry.periodDate || new Date(),
        createdBy: userData.id || userData._id,
        creatorRole: finalCreatorRole
    });

    // 2. Post CREDIT Accumulated Depreciation Account (Increases Contra-Asset / Decreases Asset value)
    await LedgerService.create({
        branch: branchId || undefined,
        accountingCode: asset.accumulatedDepreciationAccount,
        type: "CREDIT",
        amount: scheduleEntry.depreciationAmount,
        description: `Depreciation - Credit Accumulated [Asset: ${asset.name} (${asset.code}), Period #${scheduleEntry.periodIndex}]`,
        entryDate: scheduleEntry.periodDate || new Date(),
        createdBy: userData.id || userData._id,
        creatorRole: finalCreatorRole
    });

    // Update schedule entry status
    scheduleEntry.status = "Posted";
    scheduleEntry.ledgerEntry = debitEntry._id;
    scheduleEntry.postedDate = new Date();
    asset.currentValue = scheduleEntry.bookValue;

    await asset.save();
    return asset;
};

exports.bulkImportFixedAssets = async (rawAssets, userData) => {
    const createdBy = userData.id || userData._id || "507f1f77bcf86cd799439011";
    let finalCreatorRole = (userData.role || "ADMIN").toUpperCase();
    if (finalCreatorRole === "FINANCE-ADMIN" || finalCreatorRole === "FINANCIAL-ADMIN" || finalCreatorRole === "FINANCIALADMIN") {
        finalCreatorRole = "FINANCEADMIN";
    } else if (finalCreatorRole === "OPERATION-ADMIN" || finalCreatorRole === "OPERATIONALADMIN" || finalCreatorRole === "OPERATIONAL-ADMIN") {
        finalCreatorRole = "OPERATIONADMIN";
    }
    const { ROLES } = require("../../../shared/constants/roles");
    if (!Object.values(ROLES).includes(finalCreatorRole)) {
        finalCreatorRole = "ADMIN";
    }

    const FixedAssetType = require("../Model/FixedAssetTypeModel");
    const Branch = require("../../Branch/Model/BranchModel");

    // 1. Preload caches for fast lookups
    const allAccounts = await AccountingCode.find({ isDeleted: { $ne: true } }).lean();
    const accountByCode = {};
    const accountByName = {};
    for (const acc of allAccounts) {
        if (acc.code) accountByCode[acc.code.toLowerCase().trim()] = acc;
        if (acc.name) accountByName[acc.name.toLowerCase().trim()] = acc;
    }

    const allBranches = await Branch.find({ isDeleted: { $ne: true } }).lean();
    const branchByName = {};
    for (const br of allBranches) {
        if (br.name) branchByName[br.name.toLowerCase().trim()] = br;
    }

    const allVehicles = await Vehicle.find({}).select("_id legalDocs.registrationNumber").lean();
    const vehicleByReg = {};
    for (const v of allVehicles) {
        if (v.legalDocs && v.legalDocs.registrationNumber) {
            vehicleByReg[v.legalDocs.registrationNumber.toLowerCase().trim()] = v;
        }
    }

    const allAssetTypes = await FixedAssetType.find({}).lean();
    const assetTypeByName = {};
    for (const t of allAssetTypes) {
        if (t.name) assetTypeByName[t.name.toLowerCase().trim()] = t;
    }

    // Helper functions
    function parseFlexibleDate(val) {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
        if (typeof val === "number") {
            // Excel serial date
            const d = new Date((val - 25569) * 86400 * 1000);
            return isNaN(d.getTime()) ? null : d;
        }
        const str = String(val).trim();
        if (!str) return null;
        // Try DD/MM/YYYY or DD-MM-YYYY
        const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmyMatch) {
            const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
            if (!isNaN(d.getTime())) return d;
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    function getVal(row, keys) {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
        }
        
        const normalize = (s) => String(s).toLowerCase().replace(/[\s_-]/g, "");
        const normalizedKeys = keys.map(normalize);
        
        for (const k of Object.keys(row)) {
            const normalizedK = normalize(k);
            if (normalizedKeys.includes(normalizedK)) {
                if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
            }
        }
        return undefined;
    }

    const created = [];
    const duplicates = [];
    const errors = [];

    for (let i = 0; i < rawAssets.length; i++) {
        const row = rawAssets[i];
        const rowNum = i + 2; // Excel row (1-indexed header + 1-indexed data)

        try {
            // --- Extract Fixed Asset Number (code) and check duplicates ---
            const codeRaw = getVal(row, ["fixed_asset_number", "Fixed Asset Number", "code", "Code"]);
            if (!codeRaw) {
                errors.push({ row: rowNum, reason: "Missing required field: Fixed Asset Number" });
                continue;
            }
            const code = String(codeRaw).trim();

            const existingAsset = await FixedAsset.findOne({ code });
            if (existingAsset) {
                duplicates.push({ row: rowNum, code, name: getVal(row, ["fixed_asset_name", "Fixed Asset Name", "name", "Name"]) });
                continue;
            }

            // --- Extract Name ---
            const nameRaw = getVal(row, ["fixed_asset_name", "Fixed Asset Name", "name", "Name"]);
            if (!nameRaw) {
                errors.push({ row: rowNum, reason: "Missing required field: Fixed Asset Name", code });
                continue;
            }
            const name = String(nameRaw).trim();

            // --- Resolve accounts ---
            const faAccName = String(getVal(row, ["fixed_asset_account", "Fixed Asset Account", "fixedAssetAccount"]) || "").trim();
            const expAccName = String(getVal(row, ["expense_account", "Expense Account", "depreciationExpenseAccount", "depreciation_expense_account", "expenseAccount"]) || "").trim();
            const depAccName = String(getVal(row, ["depreciation_account", "Depreciation Account", "accumulatedDepreciationAccount", "accumulated_depreciation_account", "depreciationAccount"]) || "").trim();

            if (!faAccName) {
                errors.push({ row: rowNum, reason: "Missing required field: Fixed Asset Account", code, name });
                continue;
            }
            if (!expAccName) {
                errors.push({ row: rowNum, reason: "Missing required field: Expense Account", code, name });
                continue;
            }
            if (!depAccName) {
                errors.push({ row: rowNum, reason: "Missing required field: Depreciation Account", code, name });
                continue;
            }

            const fixedAssetAccount = accountByName[faAccName.toLowerCase()] || accountByCode[faAccName.toLowerCase()];
            const depreciationExpenseAccount = accountByName[expAccName.toLowerCase()] || accountByCode[expAccName.toLowerCase()];
            const accumulatedDepreciationAccount = accountByName[depAccName.toLowerCase()] || accountByCode[depAccName.toLowerCase()];

            if (!fixedAssetAccount) {
                errors.push({ row: rowNum, reason: `Fixed Asset Account not found in chart of accounts: "${faAccName}"`, code, name });
                continue;
            }
            if (!depreciationExpenseAccount) {
                errors.push({ row: rowNum, reason: `Expense Account not found in chart of accounts: "${expAccName}"`, code, name });
                continue;
            }
            if (!accumulatedDepreciationAccount) {
                errors.push({ row: rowNum, reason: `Depreciation Account not found in chart of accounts: "${depAccName}"`, code, name });
                continue;
            }

            // --- Resolve Fixed Asset Type ---
            const typeNameRaw = String(getVal(row, ["fixed_asset_type", "Fixed Asset Type"]) || "").trim();
            let fixedAssetType = undefined;
            if (typeNameRaw) {
                const typeKey = typeNameRaw.toLowerCase();
                let typeDoc = assetTypeByName[typeKey];
                if (!typeDoc) {
                    // Create Fixed Asset Type on-the-fly
                    const newTypeDoc = await FixedAssetType.create({
                        name: typeNameRaw,
                        description: `Auto-created during bulk import of asset: ${name}`,
                        createdBy,
                        creatorRole: finalCreatorRole
                    });
                    assetTypeByName[typeKey] = newTypeDoc.toObject();
                    typeDoc = newTypeDoc;
                }
                fixedAssetType = typeDoc._id;
            }

            // --- Map vehicle if registrationNumber matches Fixed Asset Name ---
            let linkedVehicle = undefined;
            const nameLower = name.toLowerCase();
            const matchedVehicle = vehicleByReg[nameLower];
            if (matchedVehicle) {
                linkedVehicle = matchedVehicle._id;
            }

            // --- Map location/branch ---
            const locNameRaw = String(getVal(row, ["location_name", "Location Name"]) || "").trim();
            let location = "Head Office"; // default
            if (locNameRaw) {
                const branchDoc = branchByName[locNameRaw.toLowerCase()];
                if (branchDoc) {
                    location = branchDoc.name;
                } else {
                    // Fallback to branch containing Panama
                    const panamaBranch = Object.values(branchByName).find(b => b.name.toLowerCase().includes("panama"));
                    if (panamaBranch) {
                        location = panamaBranch.name;
                    } else {
                        location = locNameRaw;
                    }
                }
            } else {
                // If Location Name is not in row, check Panama fallback
                const panamaBranch = Object.values(branchByName).find(b => b.name.toLowerCase().includes("panama"));
                if (panamaBranch) {
                    location = panamaBranch.name;
                }
            }

            // --- Parse dates ---
            const purchaseDateVal = getVal(row, ["purchase_date", "Purchase Date"]);
            const purchaseDate = parseFlexibleDate(purchaseDateVal);
            if (!purchaseDate) {
                errors.push({ row: rowNum, reason: "Missing or invalid field: Purchase Date", code, name });
                continue;
            }

            const depStartDateVal = getVal(row, ["depreciation_start_date", "Depreciation Start Date"]);
            const depreciationStartDate = parseFlexibleDate(depStartDateVal) || purchaseDate;

            const warrantyExpVal = getVal(row, ["warranty_expiry_date", "Warranty Expiry Date", "warrantyExpirationDate", "warranty_expiration_date"]);
            const warrantyExpirationDate = parseFlexibleDate(warrantyExpVal) || undefined;

            // --- Parse numbers ---
            const purchasePrice = Number(getVal(row, ["purchase_value", "Purchase Value", "purchasePrice", "Purchase Price"]) || 0);
            const purchaseQuantity = Number(getVal(row, ["purchase_quantity", "Purchase Quantity"]) || 1);
            const currentQuantity = Number(getVal(row, ["current_quantity", "Current Quantity"]) || 1);
            const currentValue = Number(getVal(row, ["current_value", "Current Value"]) !== undefined ? getVal(row, ["current_value", "Current Value"]) : purchasePrice);
            const disposalValue = Number(getVal(row, ["disposal_value", "Disposal Value"]) || 0);

            // --- Parse useful life ---
            const assetLife = Number(getVal(row, ["asset_life", "Asset Life"]) || 60);
            const assetLifeBasis = String(getVal(row, ["asset_life_basis", "Asset Life Basis", "assetLifeUnit"]) || "Months").trim();
            const assetLifeUnit = (assetLifeBasis.toLowerCase().startsWith("year")) ? "Years" : "Months";
            const usefulLifeYears = (assetLifeUnit === "Months") ? Math.ceil(assetLife / 12) : assetLife;

            // --- Status ---
            const statusRaw = String(getVal(row, ["status", "Status"]) || "Active").trim().toLowerCase();
            let status = "Active";
            if (statusRaw === "draft") {
                status = "Draft";
            } else if (statusRaw === "pending") {
                status = "Pending";
            } else if (statusRaw === "inactive" || statusRaw === "written off" || statusRaw === "written_off" || statusRaw === "disposed" || statusRaw === "retired") {
                status = "Inactive";
            } else {
                status = "Active";
            }

            // --- Method & Interval ---
            const depMethodRaw = String(getVal(row, ["depreciation_method", "Depreciation Method"]) || "Straight-Line").trim();
            const depreciationMethod = depMethodRaw.replace(/\s+/g, "") === "StraightLine" ? "Straight-Line" : "Straight-Line"; // Only Straight-Line supported
            
            const depreciationInterval = String(getVal(row, ["depreciation_frequency", "Depreciation Frequency", "depreciationInterval", "depreciation_interval"]) || "Monthly").trim().toLowerCase().startsWith("year") ? "Yearly" : "Monthly";

            const computationType = String(getVal(row, ["computation_type", "Computation Type"]) || "Prorata Basis").trim();
            const notes = String(getVal(row, ["notes", "Notes", "description", "Description"]) || "").trim();
            const serialNumber = String(getVal(row, ["serial_number", "Serial Number"]) || "").trim();

            const assetData = {
                name,
                code,
                purchaseDate,
                purchasePrice,
                residualValue: disposalValue, // residual value maps to disposal/salvage
                usefulLifeYears,
                location,
                purchaseQuantity,
                serialNumber,
                currentQuantity,
                currentValue,
                disposalValue,
                warrantyExpirationDate,
                fixedAssetType,
                computationType,
                depreciationStartDate,
                assetLife,
                assetLifeUnit,
                notes,
                depreciationMethod,
                depreciationInterval,
                status,
                fixedAssetAccount: fixedAssetAccount._id,
                accumulatedDepreciationAccount: accumulatedDepreciationAccount._id,
                depreciationExpenseAccount: depreciationExpenseAccount._id,
                linkedVehicle,
                createdBy,
                creatorRole: finalCreatorRole,
            };

            // Create fixed asset
            const newAsset = new FixedAsset(assetData);
            if (newAsset.status === "Active") {
                newAsset.depreciationSchedule = calculateDepreciationSchedule(newAsset);
                
                // Auto-post past depreciation periods (periodDate <= now)
                const now = new Date();
                let latestPostedBookValue = null;
                
                if (newAsset.depreciationSchedule && newAsset.depreciationSchedule.length > 0) {
                    for (const period of newAsset.depreciationSchedule) {
                        const pDate = new Date(period.periodDate);
                        if (pDate <= now) {
                            period.status = "Posted";
                            period.postedDate = now;
                            latestPostedBookValue = period.bookValue;
                        }
                    }
                }
                
                if (latestPostedBookValue !== null) {
                    newAsset.currentValue = latestPostedBookValue;
                }
            }

            await newAsset.save();
            created.push(newAsset);
        } catch (err) {
            errors.push({ row: rowNum, reason: err.message, code: getVal(row, ["fixed_asset_number", "Fixed Asset Number", "code", "Code"]), name: getVal(row, ["fixed_asset_name", "Fixed Asset Name", "name", "Name"]) });
        }
    }

    return {
        created,
        duplicates,
        errors
    };
};

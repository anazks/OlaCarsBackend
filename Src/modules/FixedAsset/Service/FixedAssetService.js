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
    const newAsset = new FixedAsset({
        ...data,
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

    return await FixedAsset.find(filter)
        .populate("fixedAssetAccount", "code name")
        .populate("accumulatedDepreciationAccount", "code name")
        .populate("depreciationExpenseAccount", "code name")
        .populate("linkedVehicle", "basicDetails.make basicDetails.model basicDetails.year legalDocs.registrationNumber")
        .populate("originalBill", "billNumber")
        .populate("originalPO", "purchaseOrderNumber")
        .sort({ createdAt: -1 });
};

// 5. Get Fixed Asset By ID
exports.getFixedAssetById = async (id) => {
    const asset = await FixedAsset.findById(id)
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

    await asset.save();
    return asset;
};

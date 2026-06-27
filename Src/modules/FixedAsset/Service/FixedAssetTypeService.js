const FixedAssetType = require("../Model/FixedAssetTypeModel");
const FixedAsset = require("../Model/FixedAssetModel");
const AppError = require("../../../shared/utils/AppError");
const { ROLES } = require("../../../shared/constants/roles");

// 1. Get all FixedAssetTypes
exports.getFixedAssetTypes = async (query = {}) => {
    const filter = {};
    if (query.isActive !== undefined) {
        filter.isActive = query.isActive === "true" || query.isActive === true;
    }

    return await FixedAssetType.find(filter).sort({ name: 1 });
};

// 2. Get FixedAssetType by ID
exports.getFixedAssetTypeById = async (id) => {
    const assetType = await FixedAssetType.findById(id);
    if (!assetType) throw new AppError("Fixed Asset Type not found", 404);
    return assetType;
};

// 3. Create FixedAssetType
exports.createFixedAssetType = async (data, userData) => {
    // Check for duplicate name (case insensitive)
    const existing = await FixedAssetType.findOne({
        name: { $regex: new RegExp(`^${data.name.trim()}$`, "i") },
    });
    if (existing) {
        throw new AppError("A Fixed Asset Type with this name already exists", 409);
    }

    // Normalize creatorRole
    let finalCreatorRole = (userData.role || "ADMIN").toUpperCase();
    if (finalCreatorRole === "FINANCE-ADMIN" || finalCreatorRole === "FINANCIAL-ADMIN" || finalCreatorRole === "FINANCIALADMIN") {
        finalCreatorRole = "FINANCEADMIN";
    } else if (finalCreatorRole === "OPERATION-ADMIN" || finalCreatorRole === "OPERATIONALADMIN" || finalCreatorRole === "OPERATIONAL-ADMIN") {
        finalCreatorRole = "OPERATIONADMIN";
    }
    if (!Object.values(ROLES).includes(finalCreatorRole)) {
        finalCreatorRole = "ADMIN";
    }

    const assetType = await FixedAssetType.create({
        name: data.name.trim(),
        description: data.description || "",
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdBy: userData.id || userData._id,
        creatorRole: finalCreatorRole,
    });

    return assetType;
};

// 4. Update FixedAssetType
exports.updateFixedAssetType = async (id, data) => {
    const assetType = await FixedAssetType.findById(id);
    if (!assetType) throw new AppError("Fixed Asset Type not found", 404);

    // Check for duplicate name if changing
    if (data.name && data.name.trim().toLowerCase() !== assetType.name.toLowerCase()) {
        const existing = await FixedAssetType.findOne({
            name: { $regex: new RegExp(`^${data.name.trim()}$`, "i") },
            _id: { $ne: id },
        });
        if (existing) {
            throw new AppError("A Fixed Asset Type with this name already exists", 409);
        }
        assetType.name = data.name.trim();
    }

    if (data.description !== undefined) assetType.description = data.description;
    if (data.isActive !== undefined) assetType.isActive = data.isActive;

    await assetType.save();
    return assetType;
};

// 5. Delete FixedAssetType
exports.deleteFixedAssetType = async (id) => {
    const assetType = await FixedAssetType.findById(id);
    if (!assetType) throw new AppError("Fixed Asset Type not found", 404);

    // Check if any FixedAsset references this type
    const usageCount = await FixedAsset.countDocuments({ fixedAssetType: id });
    if (usageCount > 0) {
        throw new AppError(
            `Cannot delete: asset type is in use by ${usageCount} fixed asset(s).`,
            400
        );
    }

    await FixedAssetType.findByIdAndDelete(id);
    return assetType;
};

// 6. Seed default FixedAssetTypes
exports.seedDefaultFixedAssetTypes = async (userData = { id: null, role: "ADMIN" }) => {
    const defaults = [
        "Vehicles",
        "Furniture and Fixtures",
        "Computer Equipment",
        "Machinery and Equipment",
        "Buildings",
        "Other Assets",
    ];

    let finalCreatorRole = (userData.role || "ADMIN").toUpperCase();
    if (finalCreatorRole === "FINANCE-ADMIN" || finalCreatorRole === "FINANCIAL-ADMIN" || finalCreatorRole === "FINANCIALADMIN") {
        finalCreatorRole = "FINANCEADMIN";
    } else if (finalCreatorRole === "OPERATION-ADMIN" || finalCreatorRole === "OPERATIONALADMIN" || finalCreatorRole === "OPERATIONAL-ADMIN") {
        finalCreatorRole = "OPERATIONADMIN";
    }
    if (!Object.values(ROLES).includes(finalCreatorRole)) {
        finalCreatorRole = "ADMIN";
    }

    for (const name of defaults) {
        const existing = await FixedAssetType.findOne({ name });
        if (!existing) {
            await FixedAssetType.create({
                name,
                description: "",
                createdBy: userData.id || userData._id || "507f1f77bcf86cd799439011",
                creatorRole: finalCreatorRole,
            });
            console.log(`[FixedAssetTypeService] Seeded default type: "${name}"`);
        }
    }
};

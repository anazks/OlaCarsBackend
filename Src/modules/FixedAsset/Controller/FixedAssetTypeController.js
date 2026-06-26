const FixedAssetTypeService = require("../Service/FixedAssetTypeService");

exports.getFixedAssetTypes = async (req, res, next) => {
    try {
        const types = await FixedAssetTypeService.getFixedAssetTypes(req.query);
        return res.status(200).json({ success: true, data: types });
    } catch (err) {
        next(err);
    }
};

exports.getFixedAssetTypeById = async (req, res, next) => {
    try {
        const type = await FixedAssetTypeService.getFixedAssetTypeById(req.params.id);
        return res.status(200).json({ success: true, data: type });
    } catch (err) {
        next(err);
    }
};

exports.addFixedAssetType = async (req, res, next) => {
    try {
        const userData = {
            id: req.user.id || req.user._id,
            role: req.user.role || req.user.creatorRole,
        };
        const newType = await FixedAssetTypeService.createFixedAssetType(req.body, userData);
        return res.status(201).json({ success: true, data: newType });
    } catch (err) {
        next(err);
    }
};

exports.updateFixedAssetType = async (req, res, next) => {
    try {
        const updatedType = await FixedAssetTypeService.updateFixedAssetType(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedType });
    } catch (err) {
        next(err);
    }
};

exports.deleteFixedAssetType = async (req, res, next) => {
    try {
        await FixedAssetTypeService.deleteFixedAssetType(req.params.id);
        return res.status(200).json({ success: true, message: "Fixed asset type deleted successfully." });
    } catch (err) {
        next(err);
    }
};

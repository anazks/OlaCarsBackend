const FixedAssetService = require("../Service/FixedAssetService");

exports.getFixedAssets = async (req, res, next) => {
    try {
        const result = await FixedAssetService.getFixedAssets(req.query);
        if (result && result.docs) {
            return res.status(200).json({
                success: true,
                data: result.docs,
                pagination: {
                    total: result.total,
                    page: result.page,
                    limit: result.limit,
                    pages: result.pages
                }
            });
        }
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getFixedAssetById = async (req, res, next) => {
    try {
        const asset = await FixedAssetService.getFixedAssetById(req.params.id);
        return res.status(200).json({ success: true, data: asset });
    } catch (err) {
        next(err);
    }
};

exports.addFixedAsset = async (req, res, next) => {
    try {
        const userData = {
            id: req.user.id || req.user._id,
            role: req.user.role || req.user.creatorRole
        };
        const newAsset = await FixedAssetService.createFixedAsset(req.body, userData);
        return res.status(201).json({ success: true, data: newAsset });
    } catch (err) {
        next(err);
    }
};

exports.updateFixedAsset = async (req, res, next) => {
    try {
        const userData = {
            id: req.user.id || req.user._id,
            role: req.user.role || req.user.creatorRole
        };
        const updatedAsset = await FixedAssetService.updateFixedAsset(req.params.id, req.body, userData);
        return res.status(200).json({ success: true, data: updatedAsset });
    } catch (err) {
        next(err);
    }
};

exports.deleteFixedAsset = async (req, res, next) => {
    try {
        await FixedAssetService.deleteFixedAsset(req.params.id);
        return res.status(200).json({ success: true, message: "Fixed asset deleted successfully." });
    } catch (err) {
        next(err);
    }
};

exports.previewDepreciationSchedule = async (req, res, next) => {
    try {
        const schedule = await FixedAssetService.previewDepreciationSchedule(req.body);
        return res.status(200).json({ success: true, data: schedule });
    } catch (err) {
        next(err);
    }
};

exports.postDepreciation = async (req, res, next) => {
    try {
        const userData = {
            id: req.user.id || req.user._id,
            role: req.user.role || req.user.creatorRole
        };
        const { periodIndex } = req.body;
        if (periodIndex === undefined) {
            return res.status(400).json({ success: false, message: "periodIndex is required." });
        }
        const updatedAsset = await FixedAssetService.postDepreciationPeriod(req.params.id, periodIndex, userData);
        return res.status(200).json({ success: true, data: updatedAsset });
    } catch (err) {
        next(err);
    }
};

exports.bulkUploadFixedAssets = async (req, res, next) => {
    try {
        const { assets } = req.body;
        if (!Array.isArray(assets) || assets.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'assets' array." });
        }

        const userData = {
            id: req.user.id || req.user._id,
            role: req.user.role || req.user.creatorRole
        };

        const result = await FixedAssetService.bulkImportFixedAssets(assets, userData);
        
        return res.status(200).json({
            success: true,
            message: `Import complete: ${result.created.length} assets created, ${result.duplicates.length} duplicates skipped, ${result.errors.length} errors.`,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

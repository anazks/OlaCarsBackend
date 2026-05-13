const CollectionService = require("../Service/CollectionService");

/**
 * Fetches overarching collections metrics and graphs dashboard payload.
 */
exports.getCollectionsOverview = async (req, res, next) => {
    try {
        // Explicit filter criteria parsed from query parameters
        const queryFilters = {
            country: req.query.country,
            branch: req.query.branch,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };

        // Execute analytics aggregating metrics
        const overview = await CollectionService.getOverview(req.user, queryFilters);

        res.status(200).json({
            success: true,
            data: overview
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Fetches interactive list data for table renderings with filtering and searches.
 */
exports.getCollectionsList = async (req, res, next) => {
    try {
        const queryFilters = {
            country: req.query.country,
            branch: req.query.branch,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            status: req.query.status,
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit,
            listType: req.query.listType
        };

        const list = await CollectionService.getList(req.user, queryFilters);

        res.status(200).json({
            success: true,
            data: list
        });
    } catch (error) {
        next(error);
    }
};

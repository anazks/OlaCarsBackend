const CollectionService = require("../Service/CollectionService");
const CollectionPdfService = require("../Service/CollectionPdfService");
const Branch = require("../../Branch/Model/BranchModel");

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

exports.exportCollectionsPdf = async (req, res, next) => {
    try {
        const queryFilters = {
            country: req.query.country,
            branch: req.query.branch,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            status: req.query.status,
            search: req.query.search,
            listType: req.query.listType,
            page: 1,
            limit: 100000 // Ensure we fetch all records for PDF rendering, ignoring pagination bounds
        };

        const listData = await CollectionService.getList(req.user, queryFilters);
        const items = listData.items || [];

        // Resolve branch name if a specific branch filter is applied
        let branchName = "";
        if (queryFilters.branch) {
            const branch = await Branch.findById(queryFilters.branch);
            if (branch) {
                branchName = branch.name;
            }
        }

        const meta = {
            branchName,
            country: queryFilters.country,
            startDate: queryFilters.startDate,
            endDate: queryFilters.endDate
        };

        // Set Headers for PDF streaming
        res.setHeader("Content-Type", "application/pdf");
        const dateStr = new Date().toISOString().split('T')[0];
        const titleLabel = queryFilters.listType ? queryFilters.listType.toLowerCase() : "collections";
        res.setHeader("Content-Disposition", `inline; filename="${titleLabel}_report_${dateStr}.pdf"`);

        // Generate and stream the PDF response
        CollectionPdfService.generateLedgerPdf(queryFilters.listType, items, meta, res);
    } catch (error) {
        next(error);
    }
};

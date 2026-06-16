/**
 * Generic utility to apply search, filtering, sorting, and pagination to a Mongoose query.
 * 
 * @param {Object} model - The Mongoose model to query.
 * @param {Object} queryParams - The request query parameters (req.query).
 * @param {Object} options - Configuration options for the helper.
 * @param {Array<string>} options.searchFields - Fields to perform regex search on.
 * @param {Array<string>} options.filterFields - Fields for exact value filtering.
 * @param {Array|Object|string} [options.populate] - Fields to populate.
 * @param {Object} [options.baseQuery] - Pre-defined query conditions (e.g. role-based limits).
 * @param {Object} [options.defaultSort] - Default sorting if none provided.
 * @returns {Promise<Object>} Paginated result with data and metadata.
 */
const applyQueryFeatures = async (model, queryParams, options = {}) => {
    try {
        const {
            search,
            sortBy,
            sortOrder = 'desc',
            page = 1,
            limit = 10,
            startDate,
            endDate,
            ...filters
        } = queryParams;

        let query = options.baseQuery ? { ...options.baseQuery } : {};

        // 1. Filtering (Exact match for whitelisted fields)
        if (options.filterFields) {
            options.filterFields.forEach(field => {
                if (filters[field] !== undefined && filters[field] !== '') {
                    // Handle query params that come in as strings "true"/"false"
                    if (filters[field] === 'true') query[field] = true;
                    else if (filters[field] === 'false') query[field] = false;
                    else if (typeof filters[field] === 'string' && filters[field].includes(',')) {
                        query[field] = { $in: filters[field].split(',') };
                    }
                    else query[field] = filters[field];
                }
            });
        }

        // 2. Date Range Filtering
        if (options.dateFilterField && (startDate || endDate)) {
            const dateQuery = {};
            if (startDate) {
                const startStr = startDate.includes("T") ? startDate : `${startDate}T00:00:00.000Z`;
                dateQuery.$gte = new Date(startStr);
            }
            if (endDate) {
                const endStr = endDate.includes("T") ? endDate : `${endDate}T23:59:59.999Z`;
                dateQuery.$lte = new Date(endStr);
            }

            // Merge with existing field query if any (though unlikely for createdAt)
            query[options.dateFilterField] = query[options.dateFilterField]
                ? { ...query[options.dateFilterField], ...dateQuery }
                : dateQuery;
        }

        // 3. Searching (Regex partial match)
        if (search && options.searchFields && options.searchFields.length > 0) {
            const words = search.trim().split(/\s+/).filter(Boolean);
            if (words.length > 0) {
                const wordQueries = words.map(word => {
                    const searchRegex = { $regex: word, $options: 'i' };
                    return {
                        $or: options.searchFields.map(field => ({
                            [field]: searchRegex
                        }))
                    };
                });
                
                if (wordQueries.length === 1) {
                    const singleOr = wordQueries[0].$or;
                    if (query.$or) {
                        query = { $and: [query, { $or: singleOr }] };
                    } else {
                        query.$or = singleOr;
                    }
                } else {
                    if (query.$and) {
                        query.$and.push(...wordQueries);
                    } else if (query.$or) {
                        query = { $and: [query, ...wordQueries] };
                    } else {
                        query.$and = wordQueries;
                    }
                }
            }
        }

        // 3. Sorting
        let sort = options.defaultSort || { createdAt: -1 };
        if (sortBy) {
            sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        // 4. Pagination
        const numericPage = Math.max(1, parseInt(page, 10) || 1);
        const numericLimit = Math.max(1, parseInt(limit, 10) || 10);
        const skip = (numericPage - 1) * numericLimit;

        // Execute Query
        const total = await model.countDocuments(query);
        
        let mongooseQuery = model.find(query).sort(sort).skip(skip).limit(numericLimit);

        if (options.select) {
            mongooseQuery = mongooseQuery.select(options.select);
        }

        if (options.populate) {
            mongooseQuery = mongooseQuery.populate(options.populate);
        }

        const data = await mongooseQuery;

        return {
            total,
            page: numericPage,
            limit: numericLimit,
            totalPages: Math.ceil(total / numericLimit),
            data
        };
    } catch (error) {
        throw error;
    }
};

module.exports = { applyQueryFeatures };

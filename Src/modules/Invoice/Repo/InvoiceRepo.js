const mongoose = require("mongoose");
const { Invoice } = require("../Model/InvoiceModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");

exports.addInvoiceService = async (data, session = null) => {
    const options = session ? { session } : {};
    const invoices = await Invoice.create([data], options);
    return invoices[0];
};

exports.addManyInvoicesService = async (dataArray, session = null) => {
    const options = session ? { session } : {};
    return await Invoice.insertMany(dataArray, options);
};

exports.getInvoicesService = async (queryParams = {}, options = {}) => {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 20;
    const skip = (page - 1) * limit;

    const baseQuery = options.baseQuery || { isDeleted: false };
    const query = { ...baseQuery };

    if (queryParams.driver) query.driver = queryParams.driver;
    if (queryParams.customer) query.customer = queryParams.customer;
    if (queryParams.vehicle) query.vehicle = queryParams.vehicle;
    if (queryParams.status && queryParams.status !== 'ALL') query.status = queryParams.status;
    if (queryParams.weekNumber) query.weekNumber = queryParams.weekNumber;
    
    if (queryParams.invoiceType) {
        if (queryParams.invoiceType === 'RENTAL') {
            query.invoiceType = { $in: ['RENTAL', null, undefined] };
        } else {
            query.invoiceType = queryParams.invoiceType;
        }
    }

    if (queryParams.startDate || queryParams.endDate) {
        const dateQuery = {};
        if (queryParams.startDate) dateQuery.$gte = new Date(queryParams.startDate);
        if (queryParams.endDate) {
            dateQuery.$lte = new Date(queryParams.endDate + 'T23:59:59.999Z');
        }
        query.$or = [
            { generatedAt: dateQuery },
            { createdAt: dateQuery }
        ];
    }

    const hasDateFilter = !!(queryParams.startDate || queryParams.endDate || queryParams.month || queryParams.year);

    if (queryParams.month || queryParams.year) {
        const now = new Date();
        const y = queryParams.year ? parseInt(queryParams.year) : now.getFullYear();
        if (queryParams.month) {
            const m = parseInt(queryParams.month) - 1;
            query.generatedAt = {
                $gte: new Date(y, m, 1, 0, 0, 0, 0),
                $lte: new Date(y, m + 1, 0, 23, 59, 59, 999)
            };
        } else {
            query.generatedAt = {
                $gte: new Date(y, 0, 1, 0, 0, 0, 0),
                $lte: new Date(y, 11, 31, 23, 59, 59, 999)
            };
        }
    }

    if (queryParams.search) {
        // Simple search by invoice number if searching
        query.invoiceNumber = { $regex: queryParams.search, $options: 'i' };
    }

    // Prepare metricsQuery from query (cast string IDs to ObjectIds for MongoDB aggregation compatibility)
    const metricsQuery = { ...query };
    if (metricsQuery.driver && typeof metricsQuery.driver === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.driver)) {
        metricsQuery.driver = new mongoose.Types.ObjectId(metricsQuery.driver);
    }
    if (metricsQuery.customer && typeof metricsQuery.customer === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.customer)) {
        metricsQuery.customer = new mongoose.Types.ObjectId(metricsQuery.customer);
    }
    if (metricsQuery.vehicle && typeof metricsQuery.vehicle === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.vehicle)) {
        metricsQuery.vehicle = new mongoose.Types.ObjectId(metricsQuery.vehicle);
    }

    // Default to start of current month to today's date if no date filters are supplied and no specific entity (customer, driver, vehicle) is targeted, and not explicitly ignored
    if (!hasDateFilter && !queryParams.customer && !queryParams.driver && !queryParams.vehicle && queryParams.ignoreDefaultDates !== 'true') {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        query.generatedAt = { $gte: startOfMonth, $lte: endOfToday };
        metricsQuery.generatedAt = { $gte: startOfMonth, $lte: endOfToday };
    }

    console.log('[InvoiceRepo] final query:', JSON.stringify(query));

    // Dynamic sort: respect queryParams sortBy/sortOrder if provided, otherwise default to workshop/weekNumber sorting
    let sortOpt = options.defaultSort;
    if (!sortOpt) {
        if (queryParams.sortBy) {
            const order = queryParams.sortOrder === 'desc' ? -1 : 1;
            sortOpt = { [queryParams.sortBy]: order };
        } else {
            sortOpt = queryParams.invoiceType === 'WORKSHOP' ? { createdAt: -1 } : { weekNumber: 1 };
        }
    }

    require("../../Driver/Model/DriverModel");
    require("../../Vehicle/Model/VehicleModel");
    require("../../Customer/Model/CustomerModel");

    // Run pagination query, counts, and metrics aggregation in parallel
    const [totalCount, stats, data] = await Promise.all([
        Invoice.countDocuments(query),
        Invoice.aggregate([
            { $match: metricsQuery },
            {
                $group: {
                    _id: null,
                    totalGrossBilled: { $sum: "$totalAmountDue" },
                    totalNetSettled: { $sum: "$amountPaid" },
                    totalCurrentBalance: { $sum: "$balance" }
                }
            }
        ]),
        Invoice.find(query)
            .populate({
                path: "customer",
                select: "name customerId email phone branch status",
                populate: { path: "branch", select: "name city country" }
            })
            .populate({
                path: "driver",
                select: "personalInfo.fullName personalInfo.email personalInfo.phone driverId branch",
                model: "Driver",
                populate: { path: "branch", select: "name country" }
            })
            .populate({
                path: "vehicle",
                select: "basicDetails.make basicDetails.model basicDetails.vin basicDetails.fleetNumber legalDocs.registrationNumber",
                model: "Vehicle"
            })
            .populate("serviceBill", "billNumber")
            .sort(sortOpt)
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    const metrics = (stats && stats.length > 0) ? {
        totalGrossBilled: stats[0].totalGrossBilled || 0,
        totalNetSettled: stats[0].totalNetSettled || 0,
        totalCurrentBalance: stats[0].totalCurrentBalance || 0,
        isFilteredPeriod: hasDateFilter
    } : {
        totalGrossBilled: 0,
        totalNetSettled: 0,
        totalCurrentBalance: 0,
        isFilteredPeriod: hasDateFilter
    };

    return {
        data,
        pagination: {
            totalItems: totalCount,
            totalPages,
            currentPage: page,
            limit,
        },
        metrics
    };
};

exports.getPendingByDriverService = async (driverId) => {
    return await Invoice.find({
        driver: driverId,
        status: { $in: ['PENDING', 'PARTIAL'] },
        balance: { $gt: 0 },
        isDeleted: false
    })
    .sort({ dueDate: 1 })
    .lean();
};

exports.getInvoiceByIdService = async (id) => {
    const invoice = await Invoice.findById(id)
        .populate({
            path: "driver",
            select: "driverId personalInfo.fullName personalInfo.email personalInfo.phone branch",
            populate: { path: "branch", select: "name country" }
        })
        .populate({
            path: "customer",
            select: "name customerId email phone branch status",
            populate: { path: "branch", select: "name city country" }
        })
        .populate("vehicle", "basicDetails.make basicDetails.model basicDetails.vin basicDetails.fleetNumber legalDocs.registrationNumber")
        .lean();
    if (!invoice || invoice.isDeleted) throw new Error("Invoice not found");
    return invoice;
};

exports.updateInvoiceService = async (id, updateData, session = null) => {
    const options = session ? { new: true, session } : { new: true };
    const updated = await Invoice.findByIdAndUpdate(id, updateData, options);
    if (!updated || updated.isDeleted) throw new Error("Invoice not found");
    return updated;
};

exports.deleteInvoiceService = async (id) => {
    const deleted = await Invoice.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!deleted) throw new Error("Invoice not found");
    return deleted;
};

exports.generateWorkshopInvoiceNumber = async () => {
    const { Invoice } = require("../Model/InvoiceModel");
    const now = new Date();
    const prefix = `WRK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastInvoice = await Invoice.findOne(
        { invoiceNumber: { $regex: `^${prefix}` } },
        { invoiceNumber: 1 },
        { sort: { invoiceNumber: -1 } }
    );
    let seq = 1;
    if (lastInvoice) {
        const parts = lastInvoice.invoiceNumber.split("-");
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        seq = (lastSeq || 0) + 1;
    }
    return `${prefix}-${String(seq).padStart(4, "0")}`;
};

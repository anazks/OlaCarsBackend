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

    // Date Range Filtering
    if (queryParams.startDate || queryParams.endDate) {
        query.dueDate = {};
        if (queryParams.startDate) query.dueDate.$gte = new Date(queryParams.startDate);
        if (queryParams.endDate) query.dueDate.$lte = new Date(queryParams.endDate);
    }

    if (queryParams.driver) query.driver = queryParams.driver;
    if (queryParams.vehicle) query.vehicle = queryParams.vehicle;
    if (queryParams.status && queryParams.status !== 'ALL') query.status = queryParams.status;
    if (queryParams.weekNumber) query.weekNumber = queryParams.weekNumber;

    // Search Logic
    if (queryParams.search) {
        const searchRegex = { $regex: queryParams.search, $options: 'i' };
        
        // Find matching drivers
        const drivers = await Driver.find({
            $or: [
                { "personalInfo.fullName": searchRegex },
                { "driverId": searchRegex }
            ]
        }).select('_id');
        const driverIds = drivers.map(d => d._id);

        // Find matching vehicles
        const vehicles = await Vehicle.find({
            $or: [
                { "legalDocs.registrationNumber": searchRegex },
                { "basicDetails.make": searchRegex },
                { "basicDetails.model": searchRegex }
            ]
        }).select('_id');
        const vehicleIds = vehicles.map(v => v._id);

        query.$or = [
            { invoiceNumber: searchRegex },
            { driver: { $in: driverIds } },
            { vehicle: { $in: vehicleIds } }
        ];
    }

    const totalCount = await Invoice.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    let sortOpt = { createdAt: -1 };
    if (queryParams.sortBy) {
        sortOpt = { [queryParams.sortBy]: queryParams.sortOrder === 'desc' ? -1 : 1 };
    }

    const data = await Invoice.find(query)
        .populate("driver", "driverId personalInfo.fullName personalInfo.email")
        .populate("vehicle", "basicDetails.make basicDetails.model legalDocs.registrationNumber")
        .sort(sortOpt)
        .skip(skip)
        .limit(limit)
        .lean();

    return {
        data,
        pagination: {
            totalItems: totalCount,
            totalPages,
            currentPage: page,
            limit,
        },
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
        .populate("driver", "driverId personalInfo.fullName personalInfo.email personalInfo.phone")
        .populate("vehicle", "basicDetails.make basicDetails.model legalDocs.registrationNumber")
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
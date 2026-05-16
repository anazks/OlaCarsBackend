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

exports.getInvoicesService = async (queryParams = {}) => {
    const { 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate, 
        status, 
        search, 
        sortBy = 'dueDate', 
        sortOrder = 'desc' 
    } = queryParams;

    const pageInt = parseInt(page, 10);
    const limitInt = parseInt(limit, 10);
    const skip = (pageInt - 1) * limitInt;

    const pipeline = [];

    // 1. Initial Match (Direct fields)
    const match = { isDeleted: false };
    if (status && status !== 'ALL') match.status = status;
    if (queryParams.driver && mongoose.Types.ObjectId.isValid(queryParams.driver)) {
        match.driver = typeof queryParams.driver === 'string' ? new mongoose.Types.ObjectId(queryParams.driver) : queryParams.driver;
    }
    if (queryParams.vehicle && mongoose.Types.ObjectId.isValid(queryParams.vehicle)) {
        match.vehicle = typeof queryParams.vehicle === 'string' ? new mongoose.Types.ObjectId(queryParams.vehicle) : queryParams.vehicle;
    }
    if (startDate || endDate) {
        match.dueDate = {};
        if (startDate) match.dueDate.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            match.dueDate.$lte = end;
        }
    }
    pipeline.push({ $match: match });

    // 2. Lookups (for searching and sorting)
    pipeline.push({
        $lookup: {
            from: "drivers",
            localField: "driver",
            foreignField: "_id",
            as: "driver"
        }
    }, { $unwind: "$driver" });

    pipeline.push({
        $lookup: {
            from: "vehicles",
            localField: "vehicle",
            foreignField: "_id",
            as: "vehicle"
        }
    }, { $unwind: { path: "$vehicle", preserveNullAndEmptyArrays: true } });

    // 3. Search Logic
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        pipeline.push({
            $match: {
                $or: [
                    { invoiceNumber: searchRegex },
                    { weekLabel: searchRegex },
                    { "driver.personalInfo.fullName": searchRegex },
                    { "driver.driverId": searchRegex },
                    { "vehicle.legalDocs.registrationNumber": searchRegex },
                    { "vehicle.basicDetails.fleetNumber": searchRegex }
                ]
            }
        });
    }

    // 4. Branch Lookup (for Node Location)
    pipeline.push(
        {
            $addFields: {
                "driver.branch": { 
                    $cond: [
                        { $and: [ { $ne: ["$driver.branch", null] }, { $ne: ["$driver.branch", ""] } ] }, 
                        { $toObjectId: "$driver.branch" }, 
                        null 
                    ] 
                }
            }
        },
        {
            $lookup: {
                from: "branches",
                localField: "driver.branch",
                foreignField: "_id",
                as: "driver.branch"
            }
        }, 
        { $unwind: { path: "$driver.branch", preserveNullAndEmptyArrays: true } }
    );

    // 5. Pre-Sort Projection (Optimize Memory)
    pipeline.push({
        $project: {
            invoiceNumber: 1,
            invoiceType: 1,
            description: 1,
            weekLabel: 1,
            weekNumber: 1,
            totalAmountDue: 1,
            amountPaid: 1,
            balance: 1,
            status: 1,
            dueDate: 1,
            createdAt: 1,
            "driver._id": 1,
            "driver.personalInfo.fullName": 1,
            "driver.driverId": 1,
            "driver.branch.name": 1,
            "driver.branch.country": 1,
            "vehicle.legalDocs.registrationNumber": 1,
            "vehicle.basicDetails.fleetNumber": 1
        }
    });

    // 6. Sorting
    const sortFieldMap = {
        'invoiceNumber': 'invoiceNumber',
        'driver': 'driver.personalInfo.fullName',
        'vehicle': 'vehicle.legalDocs.registrationNumber',
        'dueDate': 'dueDate',
        'totalAmountDue': 'totalAmountDue',
        'amountPaid': 'amountPaid',
        'balance': 'balance',
        'status': 'status',
        'weekNumber': 'weekNumber',
        'createdAt': 'createdAt'
    };

    const sortField = sortFieldMap[sortBy] || 'createdAt';
    const sortDir = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { [sortField]: sortDir } });

    // 6. Pagination
    pipeline.push({
        $facet: {
            metadata: [{ $count: "total" }],
            data: [{ $skip: skip }, { $limit: limitInt }]
        }
    });

    const result = await Invoice.aggregate(pipeline).allowDiskUse(true);
    
    const data = result[0]?.data || [];
    const totalItems = result[0]?.metadata?.[0]?.total || 0;

    return {
        data,
        pagination: {
            totalItems,
            totalPages: Math.ceil(totalItems / limitInt),
            currentPage: pageInt,
            limit: limitInt
        }
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
        .populate("vehicle", "basicDetails.make basicDetails.model basicDetails.fleetNumber legalDocs.registrationNumber")
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

exports.deleteAllInvoicesService = async () => {
    return await Invoice.updateMany({ isDeleted: false }, { isDeleted: true });
};
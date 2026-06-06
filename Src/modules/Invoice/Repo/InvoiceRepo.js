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
        query.dueDate = {};
        if (queryParams.startDate) query.dueDate.$gte = new Date(queryParams.startDate);
        if (queryParams.endDate) {
            const end = new Date(queryParams.endDate);
            end.setHours(23, 59, 59, 999);
            query.dueDate.$lte = end;
        }
    }

    if (queryParams.search) {
        // Simple search by invoice number if searching
        query.invoiceNumber = { $regex: queryParams.search, $options: 'i' };
    }

    const totalCount = await Invoice.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

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

    const data = await Invoice.find(query)
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
        .populate({
            path: "driver",
            select: "driverId personalInfo.fullName personalInfo.email personalInfo.phone branch",
            populate: { path: "branch", select: "name country" }
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

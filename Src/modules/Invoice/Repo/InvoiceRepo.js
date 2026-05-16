const { Invoice } = require("../Model/InvoiceModel");

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
    if (queryParams.vehicle) query.vehicle = queryParams.vehicle;
    if (queryParams.status) query.status = queryParams.status;
    if (queryParams.weekNumber) query.weekNumber = queryParams.weekNumber;
    if (queryParams.invoiceType) {
        if (queryParams.invoiceType === 'RENTAL') {
            query.invoiceType = { $in: ['RENTAL', null, undefined] };
        } else {
            query.invoiceType = queryParams.invoiceType;
        }
    }

    const totalCount = await Invoice.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    // Dynamic sort: if workshop, sort by createdAt
    const sortOpt = options.defaultSort || (queryParams.invoiceType === 'WORKSHOP' ? { createdAt: -1 } : { weekNumber: 1 });

    const data = await Invoice.find(query)
        .populate("driver", "personalInfo.fullName personalInfo.email")
        .populate("vehicle", "basicDetails.make basicDetails.model legalDocs.registrationNumber")
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

exports.getInvoiceByIdService = async (id) => {
    const invoice = await Invoice.findById(id)
        .populate("driver", "personalInfo.fullName personalInfo.email personalInfo.phone")
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

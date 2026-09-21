const ManualJournal = require("../Model/ManualJournalModel");

exports.createManualJournalRepo = async (data) => {
    return await ManualJournal.create(data);
};

exports.getManualJournalsRepo = async (query = {}, options = {}) => {
    const { sort = { createdAt: -1 }, populate = "", skip, limit } = options;
    let dbQuery = ManualJournal.find(query).sort(sort).populate(populate);
    if (skip !== undefined) {
        dbQuery = dbQuery.skip(skip);
    }
    if (limit !== undefined) {
        dbQuery = dbQuery.limit(limit);
    }
    return await dbQuery;
};

exports.getManualJournalByIdRepo = async (id) => {
    return await ManualJournal.findById(id)
        .populate("branch createdBy")
        .populate("contact")
        .populate({ path: "invoices.invoiceId", select: "invoiceNumber totalAmount balance status invoiceDate dueDate" })
        .populate({ path: "bills.billId", select: "billNumber totalAmount balanceDue status billDate dueDate" });
};

exports.updateManualJournalRepo = async (id, data) => {
    return await ManualJournal.findByIdAndUpdate(id, data, { new: true });
};

exports.deleteManualJournalRepo = async (id) => {
    return await ManualJournal.findByIdAndDelete(id);
};


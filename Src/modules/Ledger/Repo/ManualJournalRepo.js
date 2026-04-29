const ManualJournal = require("../Model/ManualJournalModel");

exports.createManualJournalRepo = async (data) => {
    return await ManualJournal.create(data);
};

exports.getManualJournalsRepo = async (query = {}, options = {}) => {
    const { sort = { createdAt: -1 }, populate = "" } = options;
    return await ManualJournal.find(query).sort(sort).populate(populate);
};

exports.getManualJournalByIdRepo = async (id) => {
    return await ManualJournal.findById(id).populate("branch createdBy");
};

exports.updateManualJournalRepo = async (id, data) => {
    return await ManualJournal.findByIdAndUpdate(id, data, { new: true });
};

const Branch = require("../../Branch/Model/BranchModel.js");
const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

exports.addWorkshopRepo = async (data) => {
  try {
    const newWorkshop = await Branch.create({ ...data, type: "WORKSHOP" });
    return newWorkshop;
  } catch (error) {
    throw error;
  }
};

exports.editWorkshopRepo = async (data) => {
  try {
    const { id, ...updateData } = data;
    const updated = await Branch.findOneAndUpdate(
      { _id: id, type: "WORKSHOP" },
      updateData,
      { new: true, runValidators: true }
    );
    return updated;
  } catch (error) {
    throw error;
  }
};

exports.deleteWorkshopRepo = async (id) => {
  try {
    await Branch.findOneAndUpdate(
      { _id: id, type: "WORKSHOP" },
      { isDeleted: true }
    );
  } catch (error) {
    throw error;
  }
};

exports.getWorkshopsRepo = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
      searchFields: ["name", "code"],
      filterFields: ["status", "parentBranch"],
      dateFilterField: "createdAt",
      ...options,
    };
    // Always filter by type: "WORKSHOP"
    const baseQuery = { ...(options.baseQuery || {}), type: "WORKSHOP" };
    return await applyQueryFeatures(Branch, queryParams, {
      ...queryOptions,
      baseQuery,
    });
  } catch (error) {
    throw error;
  }
};

exports.getWorkshopByIdRepo = async (id) => {
  try {
    return await Branch.findOne({ _id: id, type: "WORKSHOP", isDeleted: false });
  } catch (error) {
    throw error;
  }
};

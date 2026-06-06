const Workshop = require("../Model/WorkshopModel.js");
const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

exports.addWorkshopRepo = async (data) => {
  try {
    const newWorkshop = await Workshop.create(data);
    return newWorkshop;
  } catch (error) {
    throw error;
  }
};

exports.editWorkshopRepo = async (data) => {
  try {
    const { id, ...updateData } = data;
    const updated = await Workshop.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    return updated;
  } catch (error) {
    throw error;
  }
};

exports.deleteWorkshopRepo = async (id) => {
  try {
    await Workshop.findByIdAndUpdate(id, { isDeleted: true });
  } catch (error) {
    throw error;
  }
};

exports.getWorkshopsRepo = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
      searchFields: ["name", "code"],
      filterFields: ["status", "branchId"],
      dateFilterField: "createdAt",
      ...options,
    };
    return await applyQueryFeatures(Workshop, queryParams, queryOptions);
  } catch (error) {
    throw error;
  }
};

exports.getWorkshopByIdRepo = async (id) => {
  try {
    return await Workshop.findOne({ _id: id, isDeleted: false });
  } catch (error) {
    throw error;
  }
};

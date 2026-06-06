const Workshop = require("../Model/WorkshopModel.js");
const filterBody = require("../../../shared/utils/filterBody.js");
const AppError = require("../../../shared/utils/AppError.js");
const {
  addWorkshopRepo,
  editWorkshopRepo,
  deleteWorkshopRepo,
  getWorkshopsRepo,
  getWorkshopByIdRepo,
} = require("../Repo/WorkshopRepo.js");

const ALLOWED_CREATE_FIELDS = [
  "name",
  "code",
  "branchId",
  "phone",
  "email",
  "status",
];
const ALLOWED_UPDATE_FIELDS = [
  "name",
  "code",
  "branchId",
  "phone",
  "email",
  "status",
];

exports.create = async (data) => {
  const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
  filtered.createdBy = data.createdBy;
  filtered.creatorRole = data.creatorRole;
  const workshop = await addWorkshopRepo(filtered);
  return workshop;
};

exports.getAll = async (queryParams = {}, options = {}) => {
  return await getWorkshopsRepo(queryParams, {
    baseQuery: { isDeleted: false },
    defaultSort: { createdAt: -1 },
    ...options,
  });
};

exports.getById = async (id) => {
  return await getWorkshopByIdRepo(id);
};

exports.update = async (id, body) => {
  const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
  if (Object.keys(filtered).length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  const updated = await editWorkshopRepo({ id, ...filtered });
  if (!updated) throw new AppError("Workshop not found", 404);
  return updated;
};

exports.remove = async (id) => {
  const result = await deleteWorkshopRepo(id);
  if (!result) throw new AppError("Workshop not found", 404);
};

const Joi = require("joi");

const addWorkshopSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(3).max(100).required(),
    code: Joi.string().trim().min(2).max(20).required(),
    branchId: Joi.string()
      .trim()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    phone: Joi.string().trim().allow("", null),
    email: Joi.string().trim().email().allow("", null),
    status: Joi.string().trim().valid("ACTIVE", "INACTIVE").default("ACTIVE"),
  }),
};

const editWorkshopSchema = {
  body: Joi.object({
    id: Joi.string()
      .trim()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    name: Joi.string().trim().min(3).max(100),
    code: Joi.string().trim().min(2).max(20),
    branchId: Joi.string()
      .trim()
      .pattern(/^[0-9a-fA-F]{24}$/),
    phone: Joi.string().trim().allow("", null),
    email: Joi.string().trim().email().allow("", null),
    status: Joi.string().trim().valid("ACTIVE", "INACTIVE"),
  }).min(2),
};

const deleteWorkshopSchema = {
  params: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  }),
};

const getWorkshopByIdSchema = {
  params: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  }),
};

module.exports = {
  addWorkshopSchema,
  editWorkshopSchema,
  deleteWorkshopSchema,
  getWorkshopByIdSchema,
};

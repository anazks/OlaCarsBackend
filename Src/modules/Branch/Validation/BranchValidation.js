const Joi = require("joi");

const addBranchSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(3).max(100).required(),
        code: Joi.string().trim().min(2).max(20).required(),
        address: Joi.string().trim().required(),
        city: Joi.string().trim().required(),
        state: Joi.string().trim().required(),
        phone: Joi.string().trim().required(),
        email: Joi.string().trim().email().allow("", null),
        country: Joi.string().trim().required(),
        countryManager: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).allow("", null),
        status: Joi.string().trim().valid("ACTIVE", "INACTIVE").default("ACTIVE"),
    }),
};

const editBranchSchema = {
    body: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        name: Joi.string().trim().min(3).max(100),
        code: Joi.string().trim().min(2).max(20),
        address: Joi.string().trim(),
        city: Joi.string().trim(),
        state: Joi.string().trim(),
        phone: Joi.string().trim(),
        email: Joi.string().trim().email().allow("", null),
        country: Joi.string().trim(),
        countryManager: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).allow("", null),
        status: Joi.string().trim().valid("ACTIVE", "INACTIVE"),
    }).min(2), // id + at least one field to update
};

const deleteBranchSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const getBranchByIdSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    addBranchSchema,
    editBranchSchema,
    deleteBranchSchema,
    getBranchByIdSchema,
};

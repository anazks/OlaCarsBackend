const Joi = require("joi");

const addTaxSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(2).max(50).required(),
        rate: Joi.number().min(0).max(100).required(),
        isActive: Joi.boolean().default(true),
    }),
};

const updateTaxSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        name: Joi.string().trim().min(2).max(50),
        rate: Joi.number().min(0).max(100),
        isActive: Joi.boolean(),
    }).min(1),
};

const getTaxByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const deleteTaxSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    addTaxSchema,
    updateTaxSchema,
    getTaxByIdSchema,
    deleteTaxSchema,
};

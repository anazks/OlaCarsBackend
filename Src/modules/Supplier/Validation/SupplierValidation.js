const Joi = require("joi");

const addSupplierSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        contactPerson: Joi.string().trim().allow("", null),
        email: Joi.string().trim().email().allow("", null),
        phone: Joi.string().trim().allow("", null),
        address: Joi.string().trim().allow("", null),
        category: Joi.string().trim().valid("Vehicles", "Parts", "Services", "Insurance", "General").default("General"),
        isActive: Joi.boolean().default(true),
    }),
};

const updateSupplierSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        name: Joi.string().trim().min(2).max(100),
        contactPerson: Joi.string().trim().allow("", null),
        email: Joi.string().trim().email().allow("", null),
        phone: Joi.string().trim().allow("", null),
        address: Joi.string().trim().allow("", null),
        category: Joi.string().trim().valid("Vehicles", "Parts", "Services", "Insurance", "General"),
        isActive: Joi.boolean(),
    }).min(1),
};

const getSupplierByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const deleteSupplierSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    addSupplierSchema,
    updateSupplierSchema,
    getSupplierByIdSchema,
    deleteSupplierSchema,
};

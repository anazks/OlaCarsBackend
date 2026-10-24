const Joi = require("joi");

const addSupplierSchema = {
    body: Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        contactPerson: Joi.string().trim().allow("", null),
        email: Joi.string().trim().email().allow("", null),
        phone: Joi.string().trim().allow("", null),
        address: Joi.string().trim().allow("", null),
        category: Joi.string().trim().valid("Vehicles", "Parts", "Spare Parts", "Services", "Insurance", "Office Supplies", "IT Equipment", "Marketing", "Other", "General").default("General"),
        isActive: Joi.alternatives().try(Joi.boolean(), Joi.string()).default(true),
        documents: Joi.any().optional(),
        existingDocuments: Joi.any().optional(),
    }).unknown(true),
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
        category: Joi.string().trim().valid("Vehicles", "Parts", "Spare Parts", "Services", "Insurance", "Office Supplies", "IT Equipment", "Marketing", "Other", "General"),
        isActive: Joi.alternatives().try(Joi.boolean(), Joi.string()),
        documents: Joi.any().optional(),
        existingDocuments: Joi.any().optional(),
    }).min(1).unknown(true),
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

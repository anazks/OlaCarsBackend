const Joi = require("joi");

const createInsuranceSchema = {
    body: Joi.object({
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        policyNumber: Joi.string().trim(),
        policyType: Joi.string().trim().valid("FLEET", "INDIVIDUAL").default("FLEET"),
        coverageType: Joi.string().trim().valid("THIRD_PARTY", "COMPREHENSIVE"),

        country: Joi.string().trim().required(),
        insuredValue: Joi.number().min(0),
    }),
};

const updateInsuranceSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        policyNumber: Joi.string().trim(),
        policyType: Joi.string().trim().valid("FLEET", "INDIVIDUAL"),
        coverageType: Joi.string().trim().valid("THIRD_PARTY", "COMPREHENSIVE"),

        status: Joi.string().trim().valid("ACTIVE", "EXPIRED", "CANCELLED"),
        country: Joi.string().trim(),
        insuredValue: Joi.number().min(0),
    }).min(1),
};

const getInsuranceByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const deleteInsuranceSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const uploadDocumentSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    createInsuranceSchema,
    updateInsuranceSchema,
    getInsuranceByIdSchema,
    deleteInsuranceSchema,
    uploadDocumentSchema,
};

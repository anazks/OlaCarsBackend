const Joi = require("joi");

const createVehiclePolicySchema = {
    body: Joi.object({
        vehicle: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        insurance: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        policyNumber: Joi.string().trim().allow(""),
        startDate: Joi.date(),
        expiryDate: Joi.date().greater(Joi.ref("startDate")),
        insuredValue: Joi.number().min(0),
    }),
};

const updateVehiclePolicySchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        policyNumber: Joi.string().trim().allow(""),
        startDate: Joi.date(),
        expiryDate: Joi.date().greater(Joi.ref("startDate")),
        insuredValue: Joi.number().min(0),
        status: Joi.string().trim().valid("ACTIVE", "EXPIRED", "CANCELLED"),
    }).min(1),
};

const getVehiclePolicyByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const deleteVehiclePolicySchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    createVehiclePolicySchema,
    updateVehiclePolicySchema,
    getVehiclePolicyByIdSchema,
    deleteVehiclePolicySchema,
};

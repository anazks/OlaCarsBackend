const Joi = require("joi");

exports.addWorkshopManagerSchema = Joi.object({
    fullName: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    phone: Joi.string().optional(),
    branchId: Joi.string().required(),
    status: Joi.string().valid("ACTIVE", "SUSPENDED", "LOCKED").default("ACTIVE"),
});

exports.editWorkshopManagerSchema = Joi.object({
    fullName: Joi.string().optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    status: Joi.string().valid("ACTIVE", "SUSPENDED", "LOCKED").optional(),
});

exports.loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

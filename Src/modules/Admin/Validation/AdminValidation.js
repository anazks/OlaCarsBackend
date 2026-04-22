const Joi = require("joi");

const loginSchema = {
    body: Joi.object({
        email: Joi.string().trim().email().required().messages({
            "string.email": "Please provide a valid email address.",
            "any.required": "Email is required.",
        }),
        password: Joi.string().trim().min(6).required().messages({
            "string.min": "Password must be at least 6 characters long.",
            "any.required": "Password is required.",
        }),
    }),
};

const addAdminSchema = {
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50).required(),
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().min(6).required(),
        
        permissions: Joi.array().items(Joi.string().trim()).default([]),
        status: Joi.string().trim().valid("ACTIVE", "SUSPENDED", "LOCKED").default("ACTIVE"),
    }),
};

const editAdminSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
            "string.pattern.base": "Invalid Admin ID format.",
        }),
    }),
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50),
        email: Joi.string().trim().email(),
        
        permissions: Joi.array().items(Joi.string().trim()).default([]),
        status: Joi.string().trim().valid("ACTIVE", "SUSPENDED", "LOCKED"),
        twoFactorEnabled: Joi.boolean(),
    }).min(1),
};

const changePasswordSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required(),
    }),
};

const deleteAdminSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const getAdminByIdSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    loginSchema,
    addAdminSchema,
    editAdminSchema,
    changePasswordSchema,
    deleteAdminSchema,
    getAdminByIdSchema,
};

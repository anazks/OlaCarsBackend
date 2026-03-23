const Joi = require("joi");

const loginSchema = {
    body: Joi.object({
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().required(),
    }),
};

const addFinanceAdminSchema = {
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50).required(),
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().min(6).required(),
        status: Joi.string().trim().valid("ACTIVE", "SUSPENDED", "LOCKED").default("ACTIVE"),
        twoFactorEnabled: Joi.boolean().default(false),
    }),
};

const editFinanceAdminSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50),
        email: Joi.string().trim().email(),
        password: Joi.string().trim().min(6),
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

const deleteFinanceAdminSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const getFinanceAdminByIdSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    loginSchema,
    addFinanceAdminSchema,
    editFinanceAdminSchema,
    changePasswordSchema,
    deleteFinanceAdminSchema,
    getFinanceAdminByIdSchema,
};

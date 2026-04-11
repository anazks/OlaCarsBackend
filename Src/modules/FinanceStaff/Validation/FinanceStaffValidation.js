const Joi = require("joi");

const loginSchema = {
    body: Joi.object({
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().required(),
    }),
};

const addFinanceStaffSchema = {
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50).required(),
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().min(6).required(),
        phone: Joi.string().trim().allow("", null),
        branchId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        status: Joi.string().trim().valid("ACTIVE", "SUSPENDED", "LOCKED").default("ACTIVE"),
    }),
};

const editFinanceStaffSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50),
        email: Joi.string().trim().email(),
        password: Joi.string().trim().min(6),
        phone: Joi.string().trim().allow("", null),
        branchId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        status: Joi.string().trim().valid("ACTIVE", "SUSPENDED", "LOCKED"),
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

const deleteFinanceStaffSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const getFinanceStaffByIdSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const refreshTokenSchema = {
    body: Joi.object({
        refreshToken: Joi.string().required(),
    }),
};

module.exports = {
    loginSchema,
    addFinanceStaffSchema,
    editFinanceStaffSchema,
    changePasswordSchema,
    deleteFinanceStaffSchema,
    getFinanceStaffByIdSchema,
    refreshTokenSchema,
};


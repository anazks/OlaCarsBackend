const Joi = require("joi");

const loginSchema = {
    body: Joi.object({
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().required(),
    }),
};

const addWorkshopManagerSchema = {
    body: Joi.object({
        fullName: Joi.string().trim().min(3).max(50).required(),
        email: Joi.string().trim().email().required(),
        password: Joi.string().trim().min(6).required(),
        phone: Joi.string().trim().allow("", null),
        branchId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        status: Joi.string().trim().valid("ACTIVE", "SUSPENDED", "LOCKED").default("ACTIVE"),
    }),
};

const editWorkshopManagerSchema = {
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

const deleteWorkshopManagerSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const getWorkshopManagerByIdSchema = {
    params: Joi.object({
        id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const refreshManagerTokenSchema = {
    body: Joi.object({
        token: Joi.string().required(),
    }),
};

module.exports = {
    loginSchema,
    addWorkshopManagerSchema,
    editWorkshopManagerSchema,
    changePasswordSchema,
    deleteWorkshopManagerSchema,
    getWorkshopManagerByIdSchema,
    refreshManagerTokenSchema,
};

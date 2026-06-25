const Joi = require('joi');

const addFleetSchema = {
    body: Joi.object({
        fleetNumber: Joi.string().trim().allow("", null),
        assignedStaff: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        assignedStaffModel: Joi.string().trim().valid('OperationStaff', 'FinanceStaff').required(),
        description: Joi.string().trim().allow("", null),
        status: Joi.string().trim().valid('ACTIVE', 'INACTIVE').default('ACTIVE')
    })
};

const updateFleetSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required()
    }),
    body: Joi.object({
        fleetNumber: Joi.string().trim(),
        assignedStaff: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        assignedStaffModel: Joi.string().trim().valid('OperationStaff', 'FinanceStaff'),
        description: Joi.string().trim().allow("", null),
        status: Joi.string().trim().valid('ACTIVE', 'INACTIVE')
    })
};

const getFleetByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required()
    })
};

module.exports = {
    addFleetSchema,
    updateFleetSchema,
    getFleetByIdSchema
};

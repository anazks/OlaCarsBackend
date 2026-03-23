const Joi = require("joi");

const purchaseOrderItemSchema = Joi.object({
    itemName: Joi.string().trim().required(),
    quantity: Joi.number().integer().min(1).default(1),
    description: Joi.string().trim().allow("", null),
    unitPrice: Joi.number().min(0).required(),
    images: Joi.array().items(Joi.string().uri()).max(8).default([]),
});

const addPurchaseOrderSchema = {
    body: Joi.object({
        purpose: Joi.string().trim().valid("Vehicle", "Spare Parts", "Others").default("Others").required(),
        // Allow items as an array (JSON) or a string (Multipart)
        items: Joi.alternatives().try(
            Joi.array().items(purchaseOrderItemSchema).min(1).required(),
            Joi.string().required()
        ),
        branch: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        paymentDate: Joi.date(),
    }),
};

const approvePurchaseOrderSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        status: Joi.string().trim().valid("APPROVED", "REJECTED").required(),
    }),
};

const editPurchaseOrderSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        items: Joi.array().items(purchaseOrderItemSchema).min(1),
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        purpose: Joi.string().trim().valid("Vehicle", "Spare Parts", "Others"),
        paymentDate: Joi.date(),
    }).min(1),
};

const getPurchaseOrderByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const uploadItemImagesSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        itemId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

module.exports = {
    addPurchaseOrderSchema,
    approvePurchaseOrderSchema,
    editPurchaseOrderSchema,
    getPurchaseOrderByIdSchema,
    uploadItemImagesSchema,
};

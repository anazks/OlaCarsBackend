const Joi = require("joi");

const purchaseOrderItemSchema = Joi.object({
    _id: Joi.string().allow("", null),
    itemName: Joi.string().trim().required(),
    quantity: Joi.number().integer().min(1).default(1),
    description: Joi.string().trim().allow("", null),
    unitPrice: Joi.number().min(0).required(),
    merchandiserPrice: Joi.number().min(0).allow(null),
    accountId: Joi.string().allow("", null),
    images: Joi.array().items(Joi.string().uri()).max(8).default([]),
    prAllocations: Joi.array().items(
        Joi.object({
            prId: Joi.string().trim().allow("", null),
            prNumber: Joi.string().trim().allow("", null),
            allocatedQuantity: Joi.number().min(0),
            originalPRQuantity: Joi.number().min(0)
        }).unknown(true)
    ).default([])
}).unknown(true);

const addPurchaseOrderSchema = {
    body: Joi.object({
        purpose: Joi.string().trim().valid("Vehicle", "Spare Parts", "Others").default("Others").required(),
        // Allow items as an array (JSON) or a string (Multipart)
        items: Joi.alternatives().try(
            Joi.array().items(purchaseOrderItemSchema).min(1).required(),
            Joi.string().required()
        ),
        branch: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        paymentDate: Joi.date(),
        notes: Joi.string().trim().allow("", null),
        linkedPRs: Joi.array().items(
            Joi.object({
                prId: Joi.string().trim().allow("", null),
                prNumber: Joi.string().trim().allow("", null),
                allocatedQuantity: Joi.number().min(0),
                originalPRQuantity: Joi.number().min(0)
            }).unknown(true)
        ).default([])
    }).unknown(true),
};

const approvePurchaseOrderSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        status: Joi.string().trim().valid(
            "APPROVED", 
            "REJECTED", 
            "MANAGER_APPROVED", 
            "PENDING_FINANCE_APPROVAL", 
            "REVISION_REQUESTED", 
            "REVISION_APPROVED", 
            "PO_ISSUED", 
            "RECEIVED"
        ).required(),
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        rejectionNote: Joi.string().trim().allow("", null),
        rejectionReason: Joi.string().trim().allow("", null),
        approvalNote: Joi.string().trim().allow("", null),
    }).unknown(true),
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
        notes: Joi.string().trim().allow("", null),
        linkedPRs: Joi.array().items(
            Joi.object({
                prId: Joi.string().trim().allow("", null),
                prNumber: Joi.string().trim().allow("", null),
                allocatedQuantity: Joi.number().min(0),
                originalPRQuantity: Joi.number().min(0)
            }).unknown(true)
        ).default([])
    }).min(1).unknown(true),
};

const requestRevisionSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        reason: Joi.string().trim().required(),
    }).unknown(true),
};

const reviewRevisionSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        decision: Joi.string().valid("APPROVE", "REJECT").required(),
        note: Joi.string().trim().allow("", null),
    }).unknown(true),
};

const resubmitProposalSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        items: Joi.array().items(purchaseOrderItemSchema).min(1).required(),
        notes: Joi.string().trim().allow("", null),
    }).unknown(true),
};

const issueOfficialPOSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        supplier: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).allow("", null),
        supplierDetails: Joi.object().unknown(true),
        deliveryDate: Joi.date().allow(null),
        paymentTerms: Joi.string().trim().allow("", null),
        shippingTerms: Joi.string().trim().allow("", null),
        notes: Joi.string().trim().allow("", null),
    }).unknown(true),
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
    requestRevisionSchema,
    reviewRevisionSchema,
    resubmitProposalSchema,
    issueOfficialPOSchema,
    getPurchaseOrderByIdSchema,
    uploadItemImagesSchema,
};
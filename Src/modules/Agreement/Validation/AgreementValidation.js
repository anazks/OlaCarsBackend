const Joi = require("joi");

const createAgreementSchema = Joi.object({
  title: Joi.string().required().trim().messages({
    "string.empty": "Title is required",
    "any.required": "Title is required",
  }),
  type: Joi.string()
    .valid("TERMS_AND_CONDITIONS", "PRIVACY_POLICY", "RETURN_POLICY", "OTHER")
    .required()
    .messages({
      "any.only": "Invalid agreement type",
      "any.required": "Type is required",
    }),
  content: Joi.string().required().messages({
    "string.empty": "Content is required",
    "any.required": "Content is required",
  }),
  status: Joi.string().valid("DRAFT", "PUBLISHED", "ARCHIVED").optional(),
});

const updateAgreementSchema = Joi.object({
  title: Joi.string().trim().optional(),
  type: Joi.string()
    .valid("TERMS_AND_CONDITIONS", "PRIVACY_POLICY", "RETURN_POLICY", "OTHER")
    .optional(),
  content: Joi.string().optional(),
  status: Joi.string().valid("DRAFT", "PUBLISHED", "ARCHIVED").optional(),
});

module.exports = {
  createAgreementSchema,
  updateAgreementSchema,
};

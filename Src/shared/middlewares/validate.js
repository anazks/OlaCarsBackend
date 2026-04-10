const AppError = require("../utils/AppError");

/**
 * Middleware to validate request data against a Joi schema.
 * @param {Object} schema - Joi schema object containing body, query, and/or params.
 * @returns {Function} - Express middleware function.
 */
const validate = (schema) => (req, res, next) => {
    const validations = ['body', 'query', 'params'];
    const errors = [];

    validations.forEach((key) => {
        if (schema[key]) {
            if (key === 'body') {
                console.log(`[DEBUG] Validation - Path: ${req.originalUrl}, Body:`, JSON.stringify(req.body, null, 2));
            }
            const { error, value } = schema[key].validate(req[key], {
                abortEarly: false,
                stripUnknown: true,
            });

            if (error) {
                const details = error.details.map((detail) => detail.message);
                errors.push(...details);
            } else {
                // Update req[key] with stripped/validated values
                req[key] = value;
            }
        }
    });

    if (errors.length > 0) {
        return next(new AppError(errors.join(", "), 400));
    }

    next();
};

module.exports = validate;

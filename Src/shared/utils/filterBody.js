/**
 * Filters an object to only include allowed fields.
 * Prevents mass-assignment attacks by whitelisting updatable fields.
 *
 * @param {Object} body - The request body to filter.
 * @param  {...string} allowedFields - The fields to keep.
 * @returns {Object} A new object containing only the allowed fields.
 *
 * @example
 * const filtered = filterBody(req.body, 'fullName', 'email', 'status');
 */
const filterBody = (body, ...allowedFields) => {
    const filtered = {};
    Object.keys(body).forEach((key) => {
        if (allowedFields.includes(key)) {
            filtered[key] = body[key];
        }
    });
    return filtered;
};

module.exports = filterBody;

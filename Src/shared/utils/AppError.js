/**
 * Custom application error class with HTTP status code support.
 * Extends the native Error with a statusCode for cleaner error handling.
 */
class AppError extends Error {
    /**
     * @param {string} message - Error message.
     * @param {number} statusCode - HTTP status code (default: 500).
     */
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;

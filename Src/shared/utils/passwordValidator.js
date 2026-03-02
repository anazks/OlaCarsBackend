/**
 * Validates password strength.
 * Requirements: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.
 *
 * @param {string} password - The password to validate.
 * @throws {Error} If the password does not meet strength requirements.
 */
const validatePassword = (password) => {
    if (!password || typeof password !== 'string') {
        throw new Error('Password is required');
    }

    const errors = [];

    if (password.length < 8) {
        errors.push('at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('at least one digit');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('at least one special character');
    }

    if (errors.length > 0) {
        throw new Error(`Password must contain: ${errors.join(', ')}`);
    }
};

module.exports = validatePassword;

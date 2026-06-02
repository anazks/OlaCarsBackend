const loginSchema = {
    email: {
        in: ['body'],
        isEmail: {
            errorMessage: 'Please provide a valid email address'
        },
        normalizeEmail: true,
        trim: true,
        exists: {
            errorMessage: 'Email is required'
        }
    },
    password: {
        in: ['body'],
        exists: {
            errorMessage: 'Password is required'
        }
    }
};

module.exports = {
    loginSchema
};

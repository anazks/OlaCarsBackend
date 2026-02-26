const bcrypt = require("bcryptjs");
const CountryManager = require("../Model/CountryManagerModel.js");

/**
 * Creates a new Country Manager in the database.
 * Hashes the password if provided.
 *
 * @param {Object} data - The payload containing the country manager details.
 * @param {string} data.fullName - Full name of the country manager.
 * @param {string} data.email - Email address.
 * @param {string} data.password - Plaintext password (will be hashed).
 * @param {string} data.phone - Phone number.
 * @param {string} data.country - The country assigned to this manager.
 * @param {string} data.createdBy - ID of the admin who created this user.
 * @param {string} data.creatorRole - Role of the admin who created this user (e.g. "ADMIN", "OPERATIONADMIN").
 * @returns {Promise<Object>} The created Country Manager document.
 */
exports.addCountryManagerService = async (data) => {
    try {
        // Hash password before saving if provided
        if (data.password) {
            const salt = await bcrypt.genSalt(10);
            data.passwordHash = await bcrypt.hash(data.password, salt);
            delete data.password;
        }

        const newManager = await CountryManager.create(data);
        return newManager;
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an existing Country Manager by ID.
 * Rehashes the password if a new one is provided.
 *
 * @param {Object} data - The payload containing properties to update.
 * @param {string} data.id - The ID of the country manager to update.
 * @returns {Promise<Object>} The updated Country Manager document.
 */
exports.editCountryManagerService = async (data) => {
    try {
        const { id, ...updateData } = data;

        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.passwordHash = await bcrypt.hash(updateData.password, salt);
            delete updateData.password;
        }

        const updatedManager = await CountryManager.findByIdAndUpdate(id, updateData, { new: true });
        return updatedManager;
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a Country Manager by ID.
 * Sets `isDeleted` to true instead of removing the document.
 *
 * @param {string} id - The ID of the country manager to delete.
 * @returns {Promise<void>} 
 */
exports.deleteCountryManagerService = async (id) => {
    try {
        await CountryManager.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all active (non-deleted) Country Managers.
 *
 * @returns {Promise<Array>} A list of Country Manager documents.
 */
exports.getCountryManagersService = async () => {
    try {
        return await CountryManager.find({ isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single active Country Manager by ID.
 *
 * @param {string} id - The ID of the country manager.
 * @returns {Promise<Object|null>} The Country Manager document if found, else null.
 */
exports.getCountryManagerByIdService = async (id) => {
    try {
        return await CountryManager.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

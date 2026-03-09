const SystemSettings = require("../Model/SystemSettingsModel");

/**
 * Fetches a setting by its unique key.
 * @param {string} key 
 * @returns {Promise<any>} The value of the setting or null.
 */
const getSetting = async (key) => {
    const setting = await SystemSettings.findOne({ key });
    return setting ? setting.value : null;
};

/**
 * Updates or creates a system setting.
 * @param {string} key 
 * @param {any} value 
 * @param {string} adminId 
 * @returns {Promise<object>}
 */
const updateSetting = async (key, value, adminId) => {
    return await SystemSettings.findOneAndUpdate(
        { key },
        { value, updatedBy: adminId },
        { upsert: true, new: true }
    );
};

module.exports = {
    getSetting,
    updateSetting,
};

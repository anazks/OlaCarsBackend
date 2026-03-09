const { getSetting, updateSetting } = require("../Repo/SystemSettingsRepo");

/**
 * Gets a system setting by key.
 */
const getSystemSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const value = await getSetting(key);

        // Provide defaults for known keys if they don't exist yet
        let finalValue = value;
        if (value === null) {
            if (key === "poApprovalThreshold") finalValue = 1000;
        }

        return res.status(200).json({ success: true, key, value: finalValue });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates or creates a system setting.
 * Only Admins can call this.
 */
const updateSystemSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return res.status(400).json({ success: false, message: "Value is required in the request body." });
        }

        const updatedSetting = await updateSetting(key, value, req.user.id);
        return res.status(200).json({ success: true, data: updatedSetting });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets all system settings at once.
 */
const listSystemSettings = async (req, res) => {
    try {
        const settings = await getAllSettings();
        return res.status(200).json({ success: true, data: settings });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSystemSetting,
    updateSystemSetting,
    listSystemSettings,
};

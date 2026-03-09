const { getSetting, updateSetting } = require("../Repo/SystemSettingsRepo");

/**
 * Gets the current Purchase Order approval threshold.
 */
const getPOThreshold = async (req, res) => {
    try {
        const threshold = await getSetting("poApprovalThreshold") || 1000;
        return res.status(200).json({ success: true, threshold });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates the Purchase Order approval threshold.
 * Only Admins should be able to call this (handled via router).
 */
const updatePOThreshold = async (req, res) => {
    try {
        const { threshold } = req.body;

        if (threshold === undefined || typeof threshold !== 'number') {
            return res.status(400).json({ success: false, message: "Invalid threshold value. Must be a number." });
        }

        const updatedSetting = await updateSetting("poApprovalThreshold", threshold, req.user.id);
        return res.status(200).json({ success: true, data: updatedSetting });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getPOThreshold,
    updatePOThreshold,
};

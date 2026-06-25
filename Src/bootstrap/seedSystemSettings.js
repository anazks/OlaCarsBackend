const SystemSettings = require("../modules/SystemSettings/Model/SystemSettingsModel");

/**
 * Seeds default system settings if they don't already exist.
 */
const seedSystemSettings = async () => {
    try {
        const defaultSettings = [
            {
                key: "poApprovalThreshold",
                value: 1000,
                description: "Amount above which only ADMIN can approve Purchase Orders.",
            },
            {
                key: "driver_payment_emails_enabled",
                value: true,
                description: "Toggle to enable or suspend driver rent payment email notifications.",
            },
            {
                key: "invoice_cron_suspended",
                value: false,
                description: "Toggle to suspend or enable the automated weekly invoice generation cron job.",
            },
        ];

        for (const setting of defaultSettings) {
            const exists = await SystemSettings.findOne({ key: setting.key });
            if (!exists) {
                await SystemSettings.create(setting);
                console.log(`[Seed] System Setting created: ${setting.key}`);
            }
        }
    } catch (error) {
        console.error("[Seed] Error seeding system settings:", error.message);
    }
};

module.exports = { seedSystemSettings };

const cron = require('node-cron');
const FixedAsset = require("../Model/FixedAssetModel");
const FixedAssetService = require("./FixedAssetService");
const Admin = require("../../Admin/model/adminModel");

// Helper to check if a date is the last day of its month
const isLastDayOfMonth = (date = new Date()) => {
    const tomorrow = new Date(date);
    tomorrow.setDate(date.getDate() + 1);
    return tomorrow.getDate() === 1;
};

const startFixedAssetCronJob = () => {
    // Run daily at 23:30 (11:30 PM) to check for month-end depreciation posting
    cron.schedule('30 23 * * *', async () => {
        if (!isLastDayOfMonth()) {
            return;
        }

        console.log('[FixedAssetCronService] Last day of the month detected. Running auto-depreciation posting...');
        try {
            await exports.autoPostMonthlyDepreciation();
        } catch (error) {
            console.error('[FixedAssetCronService] Error in monthly auto-depreciation cron routine:', error);
        }
    });
};

exports.autoPostMonthlyDepreciation = async () => {
    // 1. Resolve Creator Details (Find first active ADMIN for system ledger attribution)
    const systemAdmin = await Admin.findOne({ role: 'ADMIN', isDeleted: false });
    if (!systemAdmin) {
        console.error("[FixedAssetCronService] Critical: No ADMIN found to attribute system depreciation ledger entries to.");
        return;
    }

    const userData = {
        id: systemAdmin._id,
        role: 'ADMIN'
    };

    // 2. Find all active assets
    const activeAssets = await FixedAsset.find({ status: "Active" });
    console.log(`[FixedAssetCronService] Found ${activeAssets.length} active assets to evaluate.`);

    let postedCount = 0;
    const today = new Date();

    for (const asset of activeAssets) {
        try {
            // Find any pending schedule entry due on or before today
            const dueEntries = asset.depreciationSchedule.filter(entry => 
                entry.status === "Pending" && new Date(entry.periodDate) <= today
            );

            if (dueEntries.length === 0) continue;

            console.log(`[FixedAssetCronService] Asset "${asset.name}" (${asset.code}) has ${dueEntries.length} pending entries due.`);

            for (const entry of dueEntries) {
                console.log(`[FixedAssetCronService] Auto-posting period #${entry.periodIndex} for asset "${asset.name}"`);
                await FixedAssetService.postDepreciationPeriod(asset._id, entry.periodIndex, userData);
                postedCount++;
            }
        } catch (err) {
            console.error(`[FixedAssetCronService] Failed to auto-post depreciation for asset "${asset.name}" (${asset.code}):`, err);
        }
    }

    console.log(`[FixedAssetCronService] Completed auto-depreciation posting. Total posted periods: ${postedCount}`);
};

exports.startFixedAssetCronJob = startFixedAssetCronJob;

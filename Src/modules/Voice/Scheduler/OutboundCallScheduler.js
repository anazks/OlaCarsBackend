const cron = require("node-cron");

const initOutboundCallScheduler = () => {
    // 9:00 AM Panama time = 14:00 UTC (Panama is UTC-5, no DST)
    cron.schedule("0 14 * * *", async () => {
        try {
            const { runOutboundReminders } = require("../Service/OutboundCallingService");
            await runOutboundReminders();
        } catch (error) {
            console.error("[CRON] Outbound calling error:", error.message);
        }
    });

    console.log("[CRON] Outbound Call Scheduler initialized (Daily 9AM Panama)");
};

module.exports = { initOutboundCallScheduler };

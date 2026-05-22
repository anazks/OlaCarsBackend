const { Driver } = require("../../Driver/Model/DriverModel");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OUTBOUND_AGENT_ID = process.env.OUTBOUND_AGENT_ID;
const ELEVENLABS_PHONE_NUMBER_ID = process.env.ELEVENLABS_PHONE_NUMBER_ID;

const SPANISH_MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

// Panama is UTC-5, no DST
function getPanamaDateString(offsetDays = 0) {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() - 5);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function toSpanishDate(dateStr) {
    const [, month, day] = dateStr.split("-");
    return `${parseInt(day)} de ${SPANISH_MONTHS[parseInt(month) - 1]}`;
}

// Returns YYYY-MM-DD in Panama time for a given UTC Date object
function utcDateToPanamaDateString(date) {
    const d = new Date(date);
    d.setUTCHours(d.getUTCHours() - 5);
    return d.toISOString().split("T")[0];
}

const runOutboundReminders = async () => {
    const today = getPanamaDateString(0);
    const in3 = getPanamaDateString(3);
    const in10 = getPanamaDateString(10);
    const targetDates = new Set([today, in3, in10]);

    console.log(`[OUTBOUND] Target dates: ${[...targetDates].join(", ")}`);

    const drivers = await Driver.find({ status: "ACTIVE", isDeleted: false });

    const recipients = [];
    const toMark = [];

    for (const driver of drivers) {
        if (!driver.personalInfo?.phone) continue;

        for (let i = 0; i < driver.rentTracking.length; i++) {
            const entry = driver.rentTracking[i];

            if (!["PENDING", "PARTIAL"].includes(entry.status)) continue;
            if (entry.reminderSent) continue;
            if (!entry.dueDate) continue;

            const dueDateStr = utcDateToPanamaDateString(entry.dueDate);
            if (!targetDates.has(dueDateStr)) continue;

            const daysRemaining = Math.round(
                (new Date(dueDateStr) - new Date(today)) / (1000 * 60 * 60 * 24)
            );

            recipients.push({
                phone_number: driver.personalInfo.phone,
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        customer_name: driver.personalInfo.fullName || "Cliente",
                        amount_due: String(entry.balance || 0),
                        due_date: toSpanishDate(dueDateStr),
                        days_remaining: String(Math.max(0, daysRemaining))
                    }
                }
            });

            toMark.push({ driverId: driver._id, weekIndex: i });
        }
    }

    if (recipients.length === 0) {
        console.log("[OUTBOUND] No reminders to send today.");
        return;
    }

    console.log(`[OUTBOUND] Submitting ${recipients.length} call(s)...`);

    const response = await fetch("https://api.elevenlabs.io/v1/convai/batch-calling/submit", {
        method: "POST",
        headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            agent_id: OUTBOUND_AGENT_ID,
            call_name: `Payment Reminders ${new Date().toISOString().split("T")[0]}`,
            scheduled_time_unix: Math.floor(Date.now() / 1000),
            agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
            recipients
        })
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("[OUTBOUND] ElevenLabs API error:", JSON.stringify(data));
        return;
    }

    console.log(`[OUTBOUND] Batch submitted. Response:`, JSON.stringify(data));

    for (const { driverId, weekIndex } of toMark) {
        await Driver.updateOne(
            { _id: driverId },
            { $set: { [`rentTracking.${weekIndex}.reminderSent`]: true } }
        );
    }

    console.log(`[OUTBOUND] ${toMark.length} reminder(s) marked as sent.`);
};

module.exports = { runOutboundReminders };

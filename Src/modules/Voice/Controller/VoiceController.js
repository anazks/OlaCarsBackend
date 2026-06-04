const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const Lead = require("../Model/LeadModel");
const CallLog = require("../Model/CallLogModel");
const PreBooking = require("../../AI/Model/PreBookingModel");
const mongoose = require("mongoose");
const AppError = require("../../../shared/utils/AppError");

// LOCAL TEST ONLY — triggers a single outbound call without cron or DB query
exports.testOutboundCall = async (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ success: false, error: "Not available in production" });
    }

    const { phone_number, customer_name, amount_due, due_date, days_remaining } = req.body;

    if (!phone_number) {
        return res.status(400).json({ success: false, error: "phone_number is required" });
    }

    try {
        const response = await fetch("https://api.elevenlabs.io/v1/convai/batch-calling/submit", {
            method: "POST",
            headers: {
                "xi-api-key": process.env.ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                agent_id: process.env.OUTBOUND_AGENT_ID,
                call_name: `Test Call ${new Date().toISOString()}`,
                scheduled_time_unix: Math.floor(Date.now() / 1000),
                agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
                recipients: [{
                    phone_number,
                    conversation_initiation_client_data: {
                        dynamic_variables: {
                            customer_name: customer_name || "Test User",
                            amount_due: amount_due || "150",
                            due_date: due_date || "22 de mayo",
                            days_remaining: days_remaining || "0"
                        }
                    }
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(502).json({ success: false, elevenlabs_error: data });
        }

        res.json({ success: true, elevenlabs_response: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Match a caller phone against stored driver phones regardless of formatting.
// ElevenLabs may send "917907017504" while the driver is stored as
// "+917907017504" (or with spaces/dashes), so exact match is unreliable. We try
// a set of normalised candidates, then fall back to matching the trailing digits.
const findDriverByPhone = async (callerId) => {
    const digits = String(callerId).replace(/\D/g, "");
    if (!digits) return null;

    const candidates = new Set([
        String(callerId).trim(),   // exactly as received
        digits,                    // 917907017504
        "+" + digits,              // +917907017504
        digits.slice(-10),         // 7907017504 (local without country code)
        "+" + digits.slice(-10)
    ]);

    let driver = await Driver.findOne({
        "personalInfo.phone": { $in: [...candidates] },
        isDeleted: false
    });

    // Fallback: stored number ends with the same trailing digits (covers
    // country-code differences). Min 8 digits to avoid collisions. The \D*
    // between digits tolerates stored separators e.g. "+507 6123-4567".
    if (!driver && digits.length >= 8) {
        const last8 = digits.slice(-8);
        const pattern = last8.split("").join("\\D*") + "$";
        driver = await Driver.findOne({
            "personalInfo.phone": { $regex: pattern },
            isDeleted: false
        });
    }

    return driver;
};

exports.initiateCall = async (req, res) => {
    const { caller_id } = req.body;
    const fallback = {
        type: "conversation_initiation_client_data",
        dynamic_variables: {
            is_existing_customer: "false",
            customer_id: "",
            customer_name: "",
            customer_phone: caller_id || "",
            customer_status: ""
        }
    };

    if (!caller_id) return res.json(fallback);

    try {
        const driver = await findDriverByPhone(caller_id);

        if (driver) {
            return res.json({
                type: "conversation_initiation_client_data",
                dynamic_variables: {
                    is_existing_customer: "true",
                    customer_id: driver._id.toString(),
                    customer_name: driver.personalInfo?.fullName || "Cliente",
                    customer_phone: caller_id,
                    customer_status: driver.status
                }
            });
        }

        return res.json(fallback);
    } catch (error) {
        console.error("initiateCall DB error:", error.message);
        return res.json(fallback);
    }
};

exports.getAvailableVehicles = async (req, res, next) => {
    try {
        const vehicles = await Vehicle.find({ status: "ACTIVE — AVAILABLE", isDeleted: false })
            .select("basicDetails purchaseDetails")
            .populate("purchaseDetails.branch", "name city");

        const formattedVehicles = vehicles.map(v => ({
            id: v._id,
            make: v.basicDetails?.make,
            model: v.basicDetails?.model,
            year: v.basicDetails?.year,
            category: v.basicDetails?.category,
            fuelType: v.basicDetails?.fuelType,
            transmission: v.basicDetails?.transmission,
            colour: v.basicDetails?.colour,
            seats: v.basicDetails?.seats,
            weeklyRent: v.basicDetails?.weeklyRent,
            monthlyRent: v.basicDetails?.weeklyRent ? v.basicDetails.weeklyRent * 4 : 0,
            branch: v.purchaseDetails?.branch?.name || "Unknown"
        }));

        // Loud, unambiguous empty-state so the voice agent cannot gloss over an
        // empty array and hallucinate vehicles. The message is an explicit
        // instruction the LLM reads directly.
        res.status(200).json({
            success: true,
            available_count: formattedVehicles.length,
            vehicles: formattedVehicles,
            message: formattedVehicles.length === 0
                ? "NO_VEHICLES_AVAILABLE: There are zero vehicles to offer. Do not invent or name any vehicle. Tell the customer none are available right now and offer to have a team member contact them."
                : undefined
        });
    } catch (error) {
        next(error);
    }
};

exports.getLeaseSchemes = async (req, res, next) => {
    try {
        // We aggregate the active vehicles to create lease schemes, or we could return static data
        // For simplicity, let's group available vehicles by category and take the average weekly rent
        const leaseSchemes = await Vehicle.aggregate([
            { $match: { status: "ACTIVE — AVAILABLE", isDeleted: false, "basicDetails.weeklyRent": { $gt: 0 } } },
            {
                $group: {
                    _id: "$basicDetails.category",
                    avgWeeklyRent: { $avg: "$basicDetails.weeklyRent" },
                    durationWeeks: { $first: "$basicDetails.leaseDurationWeeks" }
                }
            }
        ]);

        const formattedSchemes = leaseSchemes.map(scheme => {
            const weeklyRent = Math.round(scheme.avgWeeklyRent);
            const durationWeeks = scheme.durationWeeks || 52;
            return {
                category: scheme._id || "Other",
                weeklyRent: weeklyRent,
                durationWeeks: durationWeeks,
                totalCost: weeklyRent * durationWeeks,
                monthlyEquivalent: weeklyRent * 4,
                maintenanceIncluded: true
            };
        });

        // No static fallback: never quote prices that don't reflect real inventory.
        // When there are no active vehicles, return an empty list so the agent can
        // say promotions aren't available right now rather than reading dummy data.
        res.status(200).json({
            success: true,
            scheme_count: formattedSchemes.length,
            schemes: formattedSchemes,
            message: formattedSchemes.length === 0
                ? "NO_SCHEMES_AVAILABLE: There are zero lease schemes to offer. Do not invent or quote any price. Tell the customer plans are not available right now and offer to have a team member contact them."
                : undefined
        });
    } catch (error) {
        next(error);
    }
};

// Friendly "no account" response so the voice agent gets a clean, deterministic
// signal instead of a 400/404 error (which ElevenLabs logs as "Tool failed").
// Returned when the caller is not a recognised customer — the agent reads the
// message and offers a callback rather than retrying.
const NO_ACCOUNT_RESPONSE = {
    success: true,
    has_account: false,
    message: "NO_ACCOUNT: No account is linked to this number. Do not retry this tool. Tell the caller you don't see an account on file and offer to take their details for a team callback."
};

exports.getAccountStatus = async (req, res, next) => {
    try {
        const { customerId } = req.params;

        if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
            return res.status(200).json(NO_ACCOUNT_RESPONSE);
        }

        const driver = await Driver.findById(customerId)
            .populate("currentVehicle", "basicDetails legalDocs");

        if (!driver) {
            return res.status(200).json(NO_ACCOUNT_RESPONSE);
        }

        // Leased vehicle so the agent can answer "which car did I lease?"
        const v = driver.currentVehicle;
        const leasedVehicle = v ? {
            make: v.basicDetails?.make?.trim() || null,
            model: v.basicDetails?.model?.trim() || null,
            year: v.basicDetails?.year || null,
            colour: v.basicDetails?.colour?.trim() || null,
            plate: v.legalDocs?.registrationNumber || null
        } : null;

        const pendingWeeks = driver.rentTracking
            ?.filter(week => week.status === "PENDING" || week.status === "PARTIAL")
            ?.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
            ?.map(week => ({
                week_number: week.weekNumber,
                amount_due: week.balance,
                due_date: week.dueDate ? week.dueDate.toISOString().split("T")[0] : null,
                status: week.status
            })) || [];

        const totalDue = pendingWeeks.reduce((sum, week) => sum + (week.amount_due || 0), 0);
        const nextDueDate = pendingWeeks.length > 0 ? pendingWeeks[0].due_date : null;

        res.status(200).json({
            success: true,
            has_account: true,
            customer_name: driver.personalInfo?.fullName || "Cliente",
            leased_vehicle: leasedVehicle,
            pending_weeks: pendingWeeks,
            total_due: totalDue,
            next_due_date: nextDueDate
        });

    } catch (error) {
        next(error);
    }
};

exports.createLead = async (req, res, next) => {
    try {
        const { name, phone, interest, source, notes } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ success: false, error: "Name and phone are required" });
        }

        const lead = new Lead({
            name,
            phone,
            interest,
            source: source || "VOICE_AGENT",
            notes
        });

        await lead.save();

        res.status(201).json({
            success: true,
            lead_id: lead._id,
            message: "Lead created successfully"
        });
    } catch (error) {
        next(error);
    }
};

exports.bookVehicle = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { phone, vehicle_id, customer_name } = req.body;

        if (!phone || !vehicle_id) {
            return res.status(400).json({ success: false, error: "Phone number and vehicle_id are required" });
        }

        const vehicle = await Vehicle.findOne({ _id: vehicle_id, status: "ACTIVE — AVAILABLE", isDeleted: false }).session(session);
        if (!vehicle) {
            return res.status(404).json({ success: false, error: "Vehicle is not available or does not exist" });
        }

        let driver = await Driver.findOne({ "personalInfo.phone": phone, isDeleted: false }).session(session);
        
        if (!driver) {
            driver = new Driver({
                status: "DRAFT",
                personalInfo: {
                    fullName: customer_name || `AI Pre-booked (Phone: ${phone})`,
                    phone: phone,
                },
                branch: vehicle.purchaseDetails.branch,
                createdBy: new mongoose.Types.ObjectId(), // Placeholder
                creatorRole: "ADMIN",
            });
            await driver.save({ session });
        }

        vehicle.status = "PRE-BOOKED";
        vehicle.statusHistory.push({
            status: "PRE-BOOKED",
            notes: `Auto-reserved via Voice Agent for phone: ${phone}`,
            changedBy: driver._id,
            changedByRole: "DRIVER",
        });
        await vehicle.save({ session });

        const preBooking = new PreBooking({
            vehicle: vehicle._id,
            driver: driver._id,
            phone: phone,
            status: "PENDING",
        });
        await preBooking.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            booking_id: preBooking._id,
            message: "Vehicle pre-booked successfully"
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};

exports.logCall = async (req, res, next) => {
    try {
        const {
            call_id,
            customer_phone,
            customer_id,
            is_existing_customer,
            intent,
            outcome,
            summary,
            duration_seconds,
            timestamp
        } = req.body;

        if (!call_id) {
            return res.status(400).json({ success: false, error: "call_id is required" });
        }

        // Clean customer_id if it's an empty string
        let validCustomerId = null;
        if (customer_id && mongoose.Types.ObjectId.isValid(customer_id)) {
            validCustomerId = customer_id;
        }

        const callLog = new CallLog({
            call_id,
            customer_phone,
            customer_id: validCustomerId,
            is_existing_customer,
            intent,
            outcome,
            summary,
            duration_seconds,
            timestamp: timestamp || Date.now()
        });

        await callLog.save();

        res.status(201).json({
            success: true,
            log_id: callLog._id
        });
    } catch (error) {
        next(error);
    }
};

exports.getFollowUps = async (req, res, next) => {
    try {
        const followUps = await CallLog.find({
            intent: "needs_follow_up",
            followUpDone: { $ne: true }
        }).sort({ timestamp: -1 });

        res.json({ success: true, follow_ups: followUps });
    } catch (error) {
        next(error);
    }
};

exports.markFollowUpDone = async (req, res, next) => {
    try {
        const { logId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({ success: false, error: "Invalid log ID" });
        }

        await CallLog.findByIdAndUpdate(logId, { followUpDone: true });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

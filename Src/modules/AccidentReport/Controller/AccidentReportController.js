const { AccidentReport } = require("../Model/AccidentReportModel");
const uploadToS3 = require("../../../utils/uploadToS3");

// ─── Driver: Submit Accident Report ─────────────────────────────────────────
const submitAccidentReport = async (req, res) => {
    try {
        const driverUser = req.user; // decoded JWT — driver role=USER

        const {
            vehicleNumber,
            branch,
            alternativeMobile,
            alternativeEmail,
            accidentLocation,
            accidentDate,
            description,
        } = req.body;

        // Validate required
        if (!vehicleNumber || !branch || !alternativeMobile || !accidentLocation || !description) {
            return res.status(400).json({
                success: false,
                message: "vehicleNumber, branch, alternativeMobile, accidentLocation and description are required.",
            });
        }

        // Upload images (up to 5) to S3
        const files = req.files || [];
        if (files.length > 5) {
            return res.status(400).json({ success: false, message: "Maximum 5 images allowed." });
        }
        if (files.length < 1) {
            return res.status(400).json({ success: false, message: "At least 1 image of the accident is required." });
        }

        const imageUrls = [];
        for (const file of files) {
            const url = await uploadToS3(file, "accident-reports");
            imageUrls.push(url);
        }

        const { Driver } = require("../../../modules/Driver/Model/DriverModel");
        const driverDoc = await Driver.findById(driverUser.id || driverUser._id);
        const actualEmail = driverDoc?.personalInfo?.email || driverUser.email || driverUser.personalInfo?.email || "unknown@olacars.com";
        const actualName = driverDoc?.personalInfo?.fullName || driverUser.name || driverUser.personalInfo?.fullName || "Driver";

        const report = await AccidentReport.create({
            driver: driverUser.id || driverUser._id,
            driverName: actualName,
            driverEmail: actualEmail,
            vehicleNumber: vehicleNumber.toUpperCase().trim(),
            branch,
            alternativeMobile,
            alternativeEmail: alternativeEmail || driverUser.email || "",
            accidentLocation,
            accidentDate: accidentDate ? new Date(accidentDate) : new Date(),
            description,
            images: imageUrls,
        });

        return res.status(201).json({
            success: true,
            message: "Accident report submitted successfully. Our team will review it shortly.",
            data: report,
        });
    } catch (error) {
        console.error("[AccidentReport] Submit error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─── Driver: My Reports ──────────────────────────────────────────────────────
const getMyReports = async (req, res) => {
    try {
        const driverId = req.user.id || req.user._id;
        const reports = await AccidentReport.find({ driver: driverId })
            .sort({ createdAt: -1 })
            .populate("branch", "name city");
        return res.status(200).json({ success: true, data: reports });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Staff/Manager: Get reports by branch ───────────────────────────────────
const getReportsByBranch = async (req, res) => {
    try {
        const { branchId } = req.params;
        const { status, page = 1, limit = 20 } = req.query;

        const query = { branch: branchId };
        if (status) query.status = status;

        const total = await AccidentReport.countDocuments(query);
        const reports = await AccidentReport.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate("driver", "personalInfo currentVehicle")
            .populate("branch", "name city");

        return res.status(200).json({ success: true, data: reports, total, page, limit });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Higher Roles: Get all reports (Country / Finance Admin / Admin) ─────────
const getAllReports = async (req, res) => {
    try {
        const { status, branchId, page = 1, limit = 30 } = req.query;
        const query = {};
        if (status) query.status = status;
        if (branchId) query.branch = branchId;

        const total = await AccidentReport.countDocuments(query);
        const reports = await AccidentReport.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate("driver", "personalInfo currentVehicle")
            .populate("branch", "name city country");

        return res.status(200).json({ success: true, data: reports, total, page, limit });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Get Single Report ───────────────────────────────────────────────────────
const getReportById = async (req, res) => {
    try {
        const report = await AccidentReport.findById(req.params.id)
            .populate("driver", "personalInfo currentVehicle")
            .populate("branch", "name city country");

        if (!report) {
            return res.status(404).json({ success: false, message: "Report not found." });
        }
        return res.status(200).json({ success: true, data: report });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Manager: Update report status ───────────────────────────────────────────
const updateReportStatus = async (req, res) => {
    try {
        const { status, reviewNotes } = req.body;
        const reviewerId = req.user.id || req.user._id;
        const role = req.user.role;

        const roleModelMap = {
            BRANCHMANAGER: "BranchManager",
            COUNTRYMANAGER: "CountryManager",
            FINANCEADMIN: "FinanceAdmin",
            ADMIN: "Admin",
        };

        const report = await AccidentReport.findByIdAndUpdate(
            req.params.id,
            {
                status,
                reviewNotes,
                reviewedBy: reviewerId,
                reviewedByModel: roleModelMap[role] || "Admin",
                resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : undefined,
            },
            { new: true }
        ).populate("driver", "personalInfo").populate("branch", "name");

        if (!report) return res.status(404).json({ success: false, message: "Report not found." });

        return res.status(200).json({ success: true, message: "Report updated.", data: report });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    submitAccidentReport,
    getMyReports,
    getReportsByBranch,
    getAllReports,
    getReportById,
    updateReportStatus,
};

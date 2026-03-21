const AgreementAcceptanceService = require("../Service/AgreementAcceptanceService");
const uploadToS3 = require("../../../utils/uploadToS3");

/**
 * Record user acceptance of an agreement
 * @route POST /api/agreements/accept
 * @access Private
 */
const acceptAgreement = async (req, res) => {
    try {
        const { agreementId, versionId, signatureType, signatureData } = req.body;
        const userId = req.user.id;

        let finalSignatureData = signatureData;
        
        // Handle Drawn Signature (S3 Upload)
        if (signatureType === "DRAWN" && req.file) {
            const file = req.file;
            const key = `agreements/signatures/${userId}/${agreementId}_v${versionId}_${Date.now()}.png`;
            finalSignatureData = await uploadToS3(file, key);
        }

        const newAcceptance = await AgreementAcceptanceService.acceptAgreement(
            userId,
            agreementId,
            versionId,
            signatureType,
            finalSignatureData,
            req.ip,
            req.get("User-Agent")
        );

        return res.status(201).json({
            success: true,
            message: "Agreement accepted successfully",
            data: newAcceptance
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

/**
 * Get all agreements accepted by a user
 * @route GET /api/agreements/acceptances/:userId
 * @access Private (Admin or Self)
 */
const getUserAcceptances = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (req.user.role !== "ADMIN" && req.user.id !== userId) {
            return res.status(403).json({ success: false, message: "Not authorized to view these records." });
        }

        const data = await AgreementAcceptanceService.getUserAcceptances(userId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Verify if a user has accepted the latest version of an agreement
 * @route GET /api/agreements/verify/:userId/:agreementId
 * @access Private
 */
const verifyLatestAcceptance = async (req, res) => {
    try {
        const { userId, agreementId } = req.params;
        const result = await AgreementAcceptanceService.verifyLatestAcceptance(userId, agreementId);
        
        return res.status(200).json({ 
            success: true, 
            accepted: result.accepted,
            data: result.acceptance,
            message: result.message
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

module.exports = {
    acceptAgreement,
    getUserAcceptances,
    verifyLatestAcceptance
};

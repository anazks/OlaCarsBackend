const AgreementAcceptanceService = require("../Service/AgreementAcceptanceService");
const uploadToS3 = require("../../../utils/uploadToS3");
const getPresignedUrl = require("../../../utils/getPresignedUrl");

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

        // Sign the URL if it's an S3 link
        const obj = newAcceptance.toObject();
        if (obj.signatureType === "DRAWN" && obj.signatureData) {
            obj.signatureData = await getPresignedUrl(obj.signatureData);
        }

        return res.status(201).json({
            success: true,
            message: "Agreement accepted successfully",
            data: obj
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

/**
 * Get all agreements accepted by a user
 */
const getUserAcceptances = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (req.user.role !== "ADMIN" && req.user.id !== userId) {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }

        const data = await AgreementAcceptanceService.getUserAcceptances(userId);
        
        const processed = await Promise.all(data.map(async (acc) => {
            const obj = acc.toObject();
            if (obj.signatureType === "DRAWN" && obj.signatureData) {
                obj.signatureData = await getPresignedUrl(obj.signatureData);
            }
            return obj;
        }));

        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Verify latest acceptance
 */
const verifyLatestAcceptance = async (req, res) => {
    try {
        const { userId, agreementId } = req.params;
        const result = await AgreementAcceptanceService.verifyLatestAcceptance(userId, agreementId);
        
        if (result.acceptance) {
            const obj = result.acceptance.toObject();
            if (obj.signatureType === "DRAWN" && obj.signatureData) {
                obj.signatureData = await getPresignedUrl(obj.signatureData);
            }
            result.acceptance = obj;
        }

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

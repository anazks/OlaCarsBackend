const crypto = require("crypto");
const AgreementAcceptanceRepo = require("../Repo/AgreementAcceptanceRepo");
const AgreementRepo = require("../Repo/AgreementRepo");
const AppError = require("../../../shared/utils/AppError");

class AgreementAcceptanceService {
    /**
     * Helper to generate a digital fingerprint of the agreement content
     */
    generateFingerprint(content, userId, timestamp) {
        return crypto.createHash("sha256").update(`${content}-${userId}-${timestamp}`).digest("hex");
    }

    async acceptAgreement(userId, agreementId, versionId, signatureType, signatureData, ipAddress, userAgent) {
        const agreement = await AgreementRepo.getAgreementById(agreementId);
        if (!agreement) {
            throw new AppError("Agreement not found", 404);
        }

        // We need to find the specific version
        const versions = await AgreementRepo.getAgreementVersions(agreementId);
        const version = versions.find(v => v._id.toString() === versionId);
        
        if (!version) {
            throw new AppError("Agreement version not found", 404);
        }

        const existing = await AgreementAcceptanceRepo.findAcceptance(userId, agreementId, versionId);
        if (existing) {
            throw new AppError("This version has already been accepted by the user.", 400);
        }

        const acceptanceData = {
            userId,
            agreementId,
            versionId,
            signatureType,
            signatureData,
            ipAddress,
            userAgent,
            digitalFingerprint: this.generateFingerprint(version.content, userId, Date.now())
        };

        return await AgreementAcceptanceRepo.createAcceptance(acceptanceData);
    }

    async getUserAcceptances(userId) {
        return await AgreementAcceptanceRepo.findUserAcceptances(userId);
    }

    async verifyLatestAcceptance(userId, agreementId) {
        const agreement = await AgreementRepo.getAgreementById(agreementId);
        if (!agreement) {
            throw new AppError("Agreement not found", 404);
        }

        if (!agreement.latestVersion) {
            return { accepted: false, message: "No versions available" };
        }

        const acceptance = await AgreementAcceptanceRepo.findLatestAcceptance(userId, agreementId, agreement.latestVersion);
        
        return {
            accepted: !!acceptance,
            acceptance: acceptance || null
        };
    }
}

module.exports = new AgreementAcceptanceService();

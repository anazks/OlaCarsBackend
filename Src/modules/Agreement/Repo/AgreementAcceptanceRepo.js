const AgreementAcceptance = require("../Model/AgreementAcceptanceModel");

class AgreementAcceptanceRepo {
    async createAcceptance(data) {
        return await AgreementAcceptance.create(data);
    }

    async findAcceptance(userId, agreementId, versionId) {
        return await AgreementAcceptance.findOne({ userId, agreementId, versionId });
    }

    async findUserAcceptances(userId) {
        return await AgreementAcceptance.find({ userId })
            .populate("agreementId", "title type")
            .populate("versionId", "versionNumber status")
            .sort({ acceptedAt: -1 });
    }

    async findLatestAcceptance(userId, agreementId, latestVersionId) {
        return await AgreementAcceptance.findOne({ 
            userId, 
            agreementId, 
            versionId: latestVersionId 
        });
    }
}

module.exports = new AgreementAcceptanceRepo();

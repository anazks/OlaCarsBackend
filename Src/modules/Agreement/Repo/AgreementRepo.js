const AgreementModel = require("../Model/AgreementModel");
const AgreementVersionModel = require("../Model/AgreementVersionModel");

class AgreementRepo {
  async createAgreement(data) {
    return await AgreementModel.create(data);
  }

  async getAgreementById(id) {
    return await AgreementModel.findById(id);
  }

  async getAgreementByTitle(title, country) {
    return await AgreementModel.findOne({ title, country });
  }

  async getAllAgreements(query = {}) {
    return await AgreementModel.find(query).sort({ createdAt: -1 });
  }

  async updateAgreement(id, data, session = null) {
    return await AgreementModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
      session,
    });
  }

  async createAgreementVersion(data, session = null) {
    return await AgreementVersionModel.create([data], { session });
  }

  async getAgreementVersions(agreementId) {
    return await AgreementVersionModel.find({ agreementId }).sort({ version: -1 });
  }
}

module.exports = new AgreementRepo();

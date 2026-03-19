const AgreementService = require("../Service/AgreementService");
const { createAgreementSchema, updateAgreementSchema } = require("../Validation/AgreementValidation");

class AgreementController {
  createAgreement = async (req, res, next) => {
    try {
      // Validate request
      const { error, value } = createAgreementSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ success: false, message: error.details[0].message });
      }

      const { id: userId, role: userRole } = req.user;

      const agreement = await AgreementService.createAgreement(value, userId, userRole);

      return res.status(201).json({ success: true, message: "Agreement created successfully", data: agreement });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
    }
  };

  updateAgreement = async (req, res, next) => {
    try {
      const { id } = req.params;
      
      // Validate request
      const { error, value } = updateAgreementSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ success: false, message: error.details[0].message });
      }

      const { id: userId, role: userRole } = req.user;

      const agreement = await AgreementService.updateAgreement(id, value, userId, userRole);

      return res.status(200).json({ success: true, message: "Agreement updated successfully", data: agreement });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
    }
  };

  getAllAgreements = async (req, res, next) => {
    try {
      const query = req.query; // Add any filtering here or use generic queryHelper based on existing setup
      
      const agreements = await AgreementService.getAllAgreements(query);

      return res.status(200).json({ success: true, message: "Agreements retrieved successfully", data: agreements });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
    }
  };

  getAgreementById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const agreement = await AgreementService.getAgreementById(id);

      return res.status(200).json({ success: true, message: "Agreement retrieved successfully", data: agreement });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
    }
  };

  getAgreementVersions = async (req, res, next) => {
    try {
      const { id } = req.params;
      const versions = await AgreementService.getAgreementVersions(id);

      return res.status(200).json({ success: true, message: "Agreement versions retrieved successfully", data: versions });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
    }
  };
}

module.exports = new AgreementController();

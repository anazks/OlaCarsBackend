const { catchAsync } = require("../../../shared/utils/catchAsync");
const { sendResponse } = require("../../../shared/utils/sendResponse");
const AgreementService = require("../Service/AgreementService");
const { createAgreementSchema, updateAgreementSchema } = require("../Validation/AgreementValidation");

class AgreementController {
  createAgreement = catchAsync(async (req, res, next) => {
    // Validate request
    const { error, value } = createAgreementSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: "fail", message: error.details[0].message });
    }

    const { id: userId, role: userRole } = req.user;

    const agreement = await AgreementService.createAgreement(value, userId, userRole);

    sendResponse(res, 201, "Agreement created successfully", agreement);
  });

  updateAgreement = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    
    // Validate request
    const { error, value } = updateAgreementSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: "fail", message: error.details[0].message });
    }

    const { id: userId, role: userRole } = req.user;

    const agreement = await AgreementService.updateAgreement(id, value, userId, userRole);

    sendResponse(res, 200, "Agreement updated successfully", agreement);
  });

  getAllAgreements = catchAsync(async (req, res, next) => {
    const query = req.query; // Add any filtering here or use generic queryHelper based on existing setup
    
    const agreements = await AgreementService.getAllAgreements(query);

    sendResponse(res, 200, "Agreements retrieved successfully", agreements);
  });

  getAgreementById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const agreement = await AgreementService.getAgreementById(id);

    sendResponse(res, 200, "Agreement retrieved successfully", agreement);
  });

  getAgreementVersions = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const versions = await AgreementService.getAgreementVersions(id);

    sendResponse(res, 200, "Agreement versions retrieved successfully", versions);
  });
}

module.exports = new AgreementController();

const mongoose = require("mongoose");
const sanitizeHtml = require("sanitize-html");
const AgreementRepo = require("../Repo/AgreementRepo");
const AppError = require("../../../shared/utils/AppError");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const Branch = require("../../Branch/Model/BranchModel");
const { replacePlaceholders, AVAILABLE_PLACEHOLDERS } = require("../../../shared/utils/templateEngine");

class AgreementService {
  /**
   * Sanitizes the incoming HTML content to prevent XSS.
   */
  sanitizeContent(htmlContent) {
    if (!htmlContent) return htmlContent;
    return sanitizeHtml(htmlContent, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "img", "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span", 
        "br", "ul", "ol", "li", "strong", "b", "i", "em", "u", "a", "table", "tbody", "tr", "td", "th"
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        "*": ["style", "class"],
        a: ["href", "name", "target"],
        img: ["src", "alt", "width", "height"],
      },
      allowedIframeHostnames: ["www.youtube.com", "player.vimeo.com"],
    });
  }

  async createAgreement(data, userId, userRole) {
    const existingAgreement = await AgreementRepo.getAgreementByTitle(data.title, data.country);
    if (existingAgreement) {
      throw new AppError("An agreement with this title already exists for this country", 400);
    }

    if (data.content) {
      data.content = this.sanitizeContent(data.content);
    }

    data.createdBy = userId;
    data.creatorRole = userRole;
    data.version = 1;

    const newAgreement = await AgreementRepo.createAgreement(data);

    // Create the initial version record
    await AgreementRepo.createAgreementVersion({
      agreementId: newAgreement._id,
      title: newAgreement.title,
      country: newAgreement.country,
      type: newAgreement.type,
      content: newAgreement.content,
      version: newAgreement.version,
      updatedBy: userId,
      updaterRole: userRole,
    });

    return newAgreement;
  }

  async updateAgreement(id, data, userId, userRole) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingAgreement = await AgreementRepo.getAgreementById(id);
      if (!existingAgreement) {
        throw new AppError("Agreement not found", 404);
      }

      if (
        (data.title && data.title !== existingAgreement.title) || 
        (data.country && data.country !== existingAgreement.country)
      ) {
        const titleToCheck = data.title || existingAgreement.title;
        const countryToCheck = data.country || existingAgreement.country;
        const titleCheck = await AgreementRepo.getAgreementByTitle(titleToCheck, countryToCheck);
        if (titleCheck && titleCheck._id.toString() !== id) {
          throw new AppError("An agreement with this title already exists for this country", 400);
        }
      }

      if (data.content) {
        data.content = this.sanitizeContent(data.content);
      }

      // Check if content actually changed to warrant a new version
      let newVersionNumber = existingAgreement.version;
      let hasContentChanged = false;

      if (
        (data.content && data.content !== existingAgreement.content) || 
        (data.type && data.type !== existingAgreement.type) ||
        (data.title && data.title !== existingAgreement.title) ||
        (data.country && data.country !== existingAgreement.country)
      ) {
        newVersionNumber += 1;
        hasContentChanged = true;
      }

      const updateData = {
        ...data,
        version: newVersionNumber,
        updatedBy: userId,
        updaterRole: userRole,
      };

      const updatedAgreement = await AgreementRepo.updateAgreement(id, updateData, session);

      // Save a new version if there are meaningful changes
      if (hasContentChanged) {
        await AgreementRepo.createAgreementVersion(
          {
            agreementId: updatedAgreement._id,
            title: updatedAgreement.title,
            country: updatedAgreement.country,
            type: updatedAgreement.type,
            content: updatedAgreement.content,
            version: updatedAgreement.version,
            updatedBy: userId,
            updaterRole: userRole,
          },
          session
        );
      }

      await session.commitTransaction();
      session.endSession();

      return updatedAgreement;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  async getAllAgreements(query) {
    return await AgreementRepo.getAllAgreements(query);
  }

  async getAgreementById(id) {
    const agreement = await AgreementRepo.getAgreementById(id);
    if (!agreement) {
      throw new AppError("Agreement not found", 404);
    }
    return agreement;
  }

  async getAgreementVersions(id) {
    const versions = await AgreementRepo.getAgreementVersions(id);
    if (!versions.length) {
      throw new AppError("No versions found for this agreement", 404);
    }
    return versions;
  }

  async renderAgreement(agreementId, userId, overrides = {}) {
    const agreement = await this.getAgreementById(agreementId);
    
    // Get the latest published version, or fallback to the most recent version
    const versions = await this.getAgreementVersions(agreementId);
    const latestVersion = versions.find(v => v.status === "PUBLISHED" || v._id.toString() === agreement.latestVersion?.toString()) || versions[0];
    
    if (!latestVersion) {
      throw new AppError("No version found for this agreement", 404);
    }

    // Fetch context data
    const driver = await Driver.findOne({ _id: userId }).populate("branch");
    const data = {
        CURRENT_DATE: new Date().toLocaleDateString(),
    };

    if (driver) {
        data.DRIVER_NAME = driver.personalInfo?.fullName || "";
        data.DRIVER_EMAIL = driver.personalInfo?.email || "";
        data.DRIVER_PHONE = driver.personalInfo?.phone || "";
        data.DRIVER_NATIONALITY = driver.personalInfo?.nationality || "";
        data.DRIVER_DOB = driver.personalInfo?.dateOfBirth ? new Date(driver.personalInfo.dateOfBirth).toLocaleDateString() : "";
        data.DRIVER_LICENSE_NUMBER = driver.drivingLicense?.licenseNumber || "";
        data.DRIVER_LICENSE_EXPIRY = driver.drivingLicense?.expiryDate ? new Date(driver.drivingLicense.expiryDate).toLocaleDateString() : "";
        data.DRIVER_ID_NUMBER = driver.identityDocs?.idNumber || "";
        data.BRANCH_NAME = driver.branch?.name || "";

        const targetVehicleId = overrides.vehicleId || driver.currentVehicle;
        if (targetVehicleId) {
            const vehicle = await Vehicle.findById(targetVehicleId);
            if (vehicle) {
                data.VEHICLE_MAKE = vehicle.basicDetails?.make || "";
                data.VEHICLE_MODEL = vehicle.basicDetails?.model || "";
                data.VEHICLE_YEAR = vehicle.basicDetails?.year || "";
                data.VEHICLE_COLOR = vehicle.basicDetails?.colour || "";
                data.VEHICLE_VIN = vehicle.basicDetails?.vin || "";
                data.VEHICLE_PLATE = vehicle.legalDocs?.registrationNumber || "";
            }

            // Fetch Lease details (New)
            if (overrides.leaseDuration !== undefined && overrides.monthlyRent !== undefined) {
                data.LEASE_DURATION = overrides.leaseDuration;
                data.LEASE_MONTHLY_RENT = overrides.monthlyRent;
            } else {
                const { getLatestActiveLeaseByDriverService } = require("../../Lease/Repo/LeaseRepo");
                const lease = await getLatestActiveLeaseByDriverService(userId);
                if (lease) {
                    data.LEASE_DURATION = lease.durationMonths || "";
                    data.LEASE_MONTHLY_RENT = lease.monthlyRent || "";
                } else {
                    data.LEASE_DURATION = "";
                    data.LEASE_MONTHLY_RENT = "";
                }
            }
        }
    }

    const renderedContent = replacePlaceholders(latestVersion.content, data);

    return {
        agreement,
        version: latestVersion,
        renderedContent,
        placeholdersUsed: data
    };
  }

  getAvailablePlaceholders() {
    return AVAILABLE_PLACEHOLDERS;
  }
}

module.exports = new AgreementService();

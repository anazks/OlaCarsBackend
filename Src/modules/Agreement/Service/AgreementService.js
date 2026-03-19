const mongoose = require("mongoose");
const sanitizeHtml = require("sanitize-html");
const AgreementRepo = require("../Repo/AgreementRepo");
const { AppError } = require("../../../shared/utils/appError");

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
    const existingAgreement = await AgreementRepo.getAgreementByTitle(data.title);
    if (existingAgreement) {
      throw new AppError("An agreement with this title already exists", 400);
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

      if (data.title && data.title !== existingAgreement.title) {
        const titleCheck = await AgreementRepo.getAgreementByTitle(data.title);
        if (titleCheck) {
          throw new AppError("An agreement with this title already exists", 400);
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
        (data.title && data.title !== existingAgreement.title)
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
}

module.exports = new AgreementService();

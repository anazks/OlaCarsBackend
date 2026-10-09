const PaymentPortalService = require("../Service/PaymentPortalService");
const uploadToS3 = require("../../../utils/uploadToS3");

/**
 * Upload helper that handles both req.files (array) and req.file (single)
 */
const processUploadedFiles = async (req) => {
  const documents = [];

  const filesToUpload = [];
  if (req.files && Array.isArray(req.files)) {
    filesToUpload.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    Object.values(req.files).forEach((arr) => {
      if (Array.isArray(arr)) filesToUpload.push(...arr);
    });
  } else if (req.file) {
    filesToUpload.push(req.file);
  }

  for (const file of filesToUpload) {
    try {
      const s3Url = await uploadToS3(file, "payments-portal/documents");
      documents.push({
        name: file.originalname,
        url: s3Url,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      });
    } catch (uploadError) {
      console.error("[PaymentPortal] S3 document upload error:", uploadError);
      throw new Error(`Failed to upload document ${file.originalname}: ${uploadError.message}`);
    }
  }

  return documents;
};

// ─────────────────────────────────────────────────────────────
// 1. ADMIN PROVISIONING CONTROLLERS
// ─────────────────────────────────────────────────────────────

exports.getFinanceAdmins = async (req, res) => {
  try {
    const list = await PaymentPortalService.getFinanceAdminsWithAccess();
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.setOrUpdateMpin = async (req, res) => {
  try {
    const { financeAdminId, mpin, hasEntryAccess, hasApprovalAccess } = req.body;
    if (!financeAdminId || !mpin) {
      return res.status(400).json({
        success: false,
        message: "financeAdminId and mpin are required.",
      });
    }

    const result = await PaymentPortalService.setOrUpdateMpin({
      adminId: req.user.id,
      financeAdminId,
      mpin,
      hasEntryAccess,
      hasApprovalAccess,
    });

    return res.status(200).json({
      success: true,
      message: "MPIN set and access provisioned successfully.",
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.updatePermissions = async (req, res) => {
  try {
    const { financeAdminId } = req.params;
    const { hasEntryAccess, hasApprovalAccess, status } = req.body;

    const result = await PaymentPortalService.updatePermissions({
      financeAdminId,
      hasEntryAccess,
      hasApprovalAccess,
      status,
    });

    return res.status(200).json({
      success: true,
      message: "Permissions updated successfully.",
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.unlockFinanceAdmin = async (req, res) => {
  try {
    const { financeAdminId } = req.params;
    const result = await PaymentPortalService.unlockFinanceAdmin(financeAdminId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. AUTH & MPIN VERIFICATION CONTROLLERS
// ─────────────────────────────────────────────────────────────

exports.getMpinStatus = async (req, res) => {
  try {
    const status = await PaymentPortalService.getMpinStatus(req.user.id);
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.verifyMpin = async (req, res) => {
  try {
    const { mpin } = req.body;
    if (!mpin) {
      return res.status(400).json({ success: false, message: "MPIN is required." });
    }

    const result = await PaymentPortalService.verifyMpin(req.user.id, mpin);
    return res.status(200).json({
      success: true,
      message: "MPIN verified successfully. Payments Portal unlocked.",
      ...result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. PAYMENT ENTRIES CONTROLLERS (MAKER)
// ─────────────────────────────────────────────────────────────

exports.createEntry = async (req, res) => {
  try {
    const uploadedDocs = await processUploadedFiles(req);
    const entry = await PaymentPortalService.createEntry(
      {
        id: req.user.id,
        fullName: req.portalAccess?.fullName || req.user.fullName,
        email: req.portalAccess?.email || req.user.email,
        role: req.user.role,
      },
      req.body,
      uploadedDocs
    );

    return res.status(201).json({
      success: true,
      message: "Payment entry created and submitted for approval.",
      data: entry,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.getEntries = async (req, res) => {
  try {
    const {
      status,
      vendor,
      startDate,
      endDate,
      search,
      onlyMine,
      page,
      limit,
    } = req.query;

    const result = await PaymentPortalService.getEntries({
      userId: req.user.id,
      userRole: req.user.role,
      canApprove: req.portalAccess?.hasApprovalAccess || req.user.role === "ADMIN",
      status,
      vendor,
      startDate,
      endDate,
      search,
      onlyMine: onlyMine === "true",
      page,
      limit,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.getEntryById = async (req, res) => {
  try {
    const entry = await PaymentPortalService.getEntryById(req.params.id);
    return res.status(200).json({ success: true, data: entry });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.updateAndResubmitEntry = async (req, res) => {
  try {
    const uploadedDocs = await processUploadedFiles(req);
    const updatedEntry = await PaymentPortalService.updateAndResubmitEntry(
      {
        id: req.user.id,
        fullName: req.portalAccess?.fullName || req.user.fullName,
        email: req.portalAccess?.email || req.user.email,
        role: req.user.role,
      },
      req.params.id,
      req.body,
      uploadedDocs
    );

    return res.status(200).json({
      success: true,
      message: "Payment entry updated and re-submitted for approval.",
      data: updatedEntry,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const result = await PaymentPortalService.deleteEntry(
      { id: req.user.id, role: req.user.role },
      req.params.id
    );
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. APPROVALS CONTROLLERS (CHECKER)
// ─────────────────────────────────────────────────────────────

exports.getPendingApprovals = async (req, res) => {
  try {
    const result = await PaymentPortalService.getEntries({
      userId: req.user.id,
      userRole: req.user.role,
      canApprove: true,
      status: "PENDING_APPROVAL",
      vendor: req.query.vendor,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.approveEntry = async (req, res) => {
  try {
    const { notes } = req.body;
    const approved = await PaymentPortalService.approveEntry(
      {
        id: req.user.id,
        fullName: req.portalAccess?.fullName || req.user.fullName,
        role: req.user.role,
      },
      req.params.id,
      notes
    );

    return res.status(200).json({
      success: true,
      message: "Payment entry approved successfully.",
      data: approved,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

exports.rejectEntry = async (req, res) => {
  try {
    const { remark } = req.body;
    if (!remark || !remark.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rejection remark is required.",
      });
    }

    const rejected = await PaymentPortalService.rejectEntry(
      {
        id: req.user.id,
        fullName: req.portalAccess?.fullName || req.user.fullName,
        role: req.user.role,
      },
      req.params.id,
      remark
    );

    return res.status(200).json({
      success: true,
      message: "Payment entry rejected and returned to creator with remarks.",
      data: rejected,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. LOOKUP CONTROLLERS
// ─────────────────────────────────────────────────────────────

exports.getVendors = async (req, res) => {
  try {
    const vendors = await PaymentPortalService.getVendors();
    return res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const accounts = await PaymentPortalService.getAccounts();
    return res.status(200).json({ success: true, data: accounts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

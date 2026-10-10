const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const FinanceAdmin = require("../../FinanceAdmin/model/FinanceAdminModel");
const FinanceAdminPaymentAccess = require("../Model/FinanceAdminPaymentAccessModel");
const { PaymentPortalEntry } = require("../Model/PaymentPortalEntryModel");
const Supplier = require("../../Supplier/Model/SupplierModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

/**
 * Service handling all Payments Portal business logic
 */
class PaymentPortalService {
  // ─────────────────────────────────────────────────────────────
  // 1. ADMIN PROVISIONING & MPIN MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Get all Financial Admins with their Payments Portal access status
   */
  static async getFinanceAdminsWithAccess() {
    const financeAdmins = await FinanceAdmin.find({ isDeleted: false })
      .select("fullName email status createdAt lastLoginAt")
      .lean();

    const accessRecords = await FinanceAdminPaymentAccess.find({}).lean();
    const accessMap = new Map();
    accessRecords.forEach((rec) => {
      accessMap.set(String(rec.financeAdminId), rec);
    });

    return financeAdmins.map((fa) => {
      const access = accessMap.get(String(fa._id));
      const isLocked =
        access && access.lockUntil && new Date(access.lockUntil) > new Date();

      return {
        _id: fa._id,
        fullName: fa.fullName,
        email: fa.email,
        adminStatus: fa.status,
        isMpinSet: !!access,
        mpin: access ? access.mpin : null,
        hasEntryAccess: access ? access.hasEntryAccess : false,
        hasApprovalAccess: access ? access.hasApprovalAccess : false,
        portalStatus: access ? (isLocked ? "LOCKED" : access.status) : "NOT_CONFIGURED",
        failedAttempts: access ? access.failedAttempts : 0,
        lastMpinLoginAt: access ? access.lastMpinLoginAt : null,
        setAt: access ? access.setAt : null,
      };
    });
  }

  /**
   * Admin sets or updates a numeric MPIN for a Financial Admin
   */
  static async setOrUpdateMpin({
    adminId,
    financeAdminId,
    mpin,
    hasEntryAccess,
    hasApprovalAccess,
  }) {
    if (!mpin || !/^\d{4,6}$/.test(String(mpin).trim())) {
      const error = new Error("MPIN must be a 4 to 6 digit numeric code.");
      error.statusCode = 400;
      throw error;
    }

    const financeAdmin = await FinanceAdmin.findOne({
      _id: financeAdminId,
      isDeleted: false,
    });

    if (!financeAdmin) {
      const error = new Error("Financial Admin not found.");
      error.statusCode = 404;
      throw error;
    }

    const mpinHash = await bcrypt.hash(String(mpin).trim(), 10);

    const updatePayload = {
      fullName: financeAdmin.fullName,
      email: financeAdmin.email,
      mpin: String(mpin).trim(),
      mpinHash,
      status: "ACTIVE",
      failedAttempts: 0,
      lockUntil: null,
      setBy: adminId,
      setAt: new Date(),
    };

    if (typeof hasEntryAccess === "boolean") {
      updatePayload.hasEntryAccess = hasEntryAccess;
    }
    if (typeof hasApprovalAccess === "boolean") {
      updatePayload.hasApprovalAccess = hasApprovalAccess;
    }

    const access = await FinanceAdminPaymentAccess.findOneAndUpdate(
      { financeAdminId },
      { $set: updatePayload },
      { new: true, upsert: true, runValidators: true }
    );

    return {
      financeAdminId: access.financeAdminId,
      fullName: access.fullName,
      email: access.email,
      mpin: access.mpin,
      hasEntryAccess: access.hasEntryAccess,
      hasApprovalAccess: access.hasApprovalAccess,
      status: access.status,
    };
  }

  /**
   * Admin updates provisioned access roles (Entry / Approval)
   */
  static async updatePermissions({
    financeAdminId,
    hasEntryAccess,
    hasApprovalAccess,
    status,
  }) {
    const access = await FinanceAdminPaymentAccess.findOne({ financeAdminId });
    if (!access) {
      const error = new Error("Payment portal access not configured for this user. Set MPIN first.");
      error.statusCode = 404;
      throw error;
    }

    if (typeof hasEntryAccess === "boolean") access.hasEntryAccess = hasEntryAccess;
    if (typeof hasApprovalAccess === "boolean") access.hasApprovalAccess = hasApprovalAccess;
    if (status && ["ACTIVE", "SUSPENDED", "LOCKED"].includes(status)) {
      access.status = status;
      if (status === "ACTIVE") {
        access.failedAttempts = 0;
        access.lockUntil = null;
      }
    }

    await access.save();

    return {
      financeAdminId: access.financeAdminId,
      hasEntryAccess: access.hasEntryAccess,
      hasApprovalAccess: access.hasApprovalAccess,
      status: access.status,
    };
  }

  /**
   * Admin unlocks a locked Financial Admin
   */
  static async unlockFinanceAdmin(financeAdminId) {
    const access = await FinanceAdminPaymentAccess.findOne({ financeAdminId });
    if (!access) {
      const error = new Error("Payment portal access record not found.");
      error.statusCode = 404;
      throw error;
    }

    access.failedAttempts = 0;
    access.lockUntil = null;
    access.status = "ACTIVE";
    await access.save();

    return { message: "Financial Admin portal access unlocked successfully." };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MPIN AUTHENTICATION (FINANCIAL ADMIN)
  // ─────────────────────────────────────────────────────────────

  /**
   * Check MPIN status for current Financial Admin
   */
  static async getMpinStatus(financeAdminId) {
    const access = await FinanceAdminPaymentAccess.findOne({ financeAdminId });
    if (!access) {
      return {
        isMpinSet: false,
        hasEntryAccess: false,
        hasApprovalAccess: false,
        status: "NOT_CONFIGURED",
      };
    }

    return {
      isMpinSet: true,
      hasEntryAccess: access.hasEntryAccess,
      hasApprovalAccess: access.hasApprovalAccess,
      status: access.isLocked() ? "LOCKED" : access.status,
      isLocked: access.isLocked(),
      lockUntil: access.lockUntil,
    };
  }

  /**
   * Verify MPIN and issue scoped Portal Token
   */
  static async verifyMpin(financeAdminId, mpin) {
    if (!mpin) {
      const error = new Error("MPIN is required.");
      error.statusCode = 400;
      throw error;
    }

    const access = await FinanceAdminPaymentAccess.findOne({ financeAdminId });
    if (!access) {
      const error = new Error(
        "MPIN has not been set by Administrator for your account. Please contact an Administrator."
      );
      error.statusCode = 400;
      throw error;
    }

    if (access.status === "SUSPENDED") {
      const error = new Error("Your Payments Portal access is currently suspended. Please contact Administrator.");
      error.statusCode = 403;
      throw error;
    }

    if (access.isLocked()) {
      const remainingMinutes = Math.ceil(
        (new Date(access.lockUntil).getTime() - Date.now()) / (60 * 1000)
      );
      const error = new Error(
        `Account is temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s) or contact Administrator.`
      );
      error.statusCode = 423;
      throw error;
    }

    const isMatch = await bcrypt.compare(String(mpin).trim(), access.mpinHash);

    if (!isMatch) {
      access.failedAttempts = (access.failedAttempts || 0) + 1;
      const MAX_ATTEMPTS = 5;

      if (access.failedAttempts >= MAX_ATTEMPTS) {
        access.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes lockout
        access.status = "LOCKED";
        await access.save();
        const error = new Error(
          "Maximum failed attempts reached. Your portal access is locked for 30 minutes."
        );
        error.statusCode = 423;
        throw error;
      }

      await access.save();
      const remaining = MAX_ATTEMPTS - access.failedAttempts;
      const error = new Error(
        `Incorrect MPIN. ${remaining} attempt(s) remaining before account lockout.`
      );
      error.statusCode = 401;
      throw error;
    }

    // Success: reset failed attempts
    access.failedAttempts = 0;
    access.lockUntil = null;
    access.lastMpinLoginAt = new Date();
    await access.save();

    // Sign scoped Portal Session Token (valid for 8 hours)
    const portalToken = jwt.sign(
      {
        financeAdminId: String(access.financeAdminId),
        role: "FINANCEADMIN",
        hasEntryAccess: access.hasEntryAccess,
        hasApprovalAccess: access.hasApprovalAccess,
        portalVerified: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return {
      portalToken,
      user: {
        financeAdminId: access.financeAdminId,
        fullName: access.fullName,
        email: access.email,
        hasEntryAccess: access.hasEntryAccess,
        hasApprovalAccess: access.hasApprovalAccess,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PAYMENT PORTAL ENTRIES (MAKER / CREATOR)
  // ─────────────────────────────────────────────────────────────

  /**
   * Helper to generate unique sequential entry number: PPE-YYYYMM-XXXX
   */
  static async generateEntryNumber() {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prefix = `PPE-${yearMonth}-`;

    const latest = await PaymentPortalEntry.findOne({
      entryNumber: new RegExp(`^${prefix}`),
    })
      .sort({ createdAt: -1 })
      .select("entryNumber");

    let sequence = 1;
    if (latest && latest.entryNumber) {
      const parts = latest.entryNumber.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(4, "0")}`;
  }

  /**
   * Create a new payment entry
   */
  static async createEntry(user, data, uploadedDocuments = []) {
    const {
      vendor,
      amount,
      currency = "USD",
      debitAccount,
      creditAccount,
      paymentDate,
      referenceNumber,
      description,
      isDraft = false,
    } = data;

    if (!vendor || !amount || !debitAccount || !creditAccount) {
      const error = new Error("Vendor, amount, debitAccount, and creditAccount are required.");
      error.statusCode = 400;
      throw error;
    }

    if (!uploadedDocuments || uploadedDocuments.length === 0) {
      const error = new Error("At least one supporting document (invoice / bill receipt PDF or image) is mandatory.");
      error.statusCode = 400;
      throw error;
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      const error = new Error("Amount must be a valid positive number.");
      error.statusCode = 400;
      throw error;
    }

    // Validate Vendor
    const vendorDoc = await Supplier.findById(vendor).select("name companyName");
    if (!vendorDoc) {
      const error = new Error("Selected vendor does not exist.");
      error.statusCode = 400;
      throw error;
    }

    // Validate Accounts
    const [debitAcc, creditAcc] = await Promise.all([
      AccountingCode.findById(debitAccount).select("name code category"),
      AccountingCode.findById(creditAccount).select("name code category"),
    ]);

    if (!debitAcc) {
      const error = new Error("Selected Debit account does not exist.");
      error.statusCode = 400;
      throw error;
    }
    if (!creditAcc) {
      const error = new Error("Selected Credit account does not exist.");
      error.statusCode = 400;
      throw error;
    }

    const entryNumber = await this.generateEntryNumber();
    const initialStatus = isDraft ? "DRAFT" : "PENDING_APPROVAL";

    const entry = new PaymentPortalEntry({
      entryNumber,
      vendor,
      vendorName: vendorDoc.name || vendorDoc.companyName,
      amount: parsedAmount,
      currency,
      debitAccount,
      creditAccount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNumber,
      description,
      supportingDocuments: uploadedDocuments,
      status: initialStatus,
      createdBy: user.id,
      creatorName: user.fullName || "Financial Admin",
      creatorEmail: user.email || "",
      statusHistory: [
        {
          status: initialStatus,
          actionBy: user.id,
          actionByName: user.fullName || "Financial Admin",
          actionRole: "FINANCEADMIN",
          remarks: description || (isDraft ? "Saved as draft" : "Submitted for approval"),
        },
      ],
    });

    await entry.save();
    return entry;
  }

  /**
   * List entries with role-aware scoping and filters
   */
  static async getEntries({
    userId,
    userRole,
    canApprove,
    status,
    vendor,
    startDate,
    endDate,
    search,
    onlyMine = false,
    page = 1,
    limit = 20,
  }) {
    const query = {};

    // Scoping: Filter to own entries only if explicitly requested
    if (onlyMine) {
      query.createdBy = userId;
    }

    if (status) {
      query.status = status;
    }

    if (vendor && mongoose.Types.ObjectId.isValid(vendor)) {
      query.vendor = vendor;
    }

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.paymentDate.$lte = end;
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { entryNumber: searchRegex },
        { referenceNumber: searchRegex },
        { vendorName: searchRegex },
        { description: searchRegex },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const take = Math.max(1, parseInt(limit, 10));

    const [entries, total] = await Promise.all([
      PaymentPortalEntry.find(query)
        .populate("vendor", "name vendorNumber companyName email phone")
        .populate("debitAccount", "name code category accountType")
        .populate("creditAccount", "name code category accountType")
        .populate("createdBy", "fullName email")
        .populate("reviewedBy", "fullName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .lean(),
      PaymentPortalEntry.countDocuments(query),
    ]);

    return {
      entries,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Get single entry details
   */
  static async getEntryById(entryId) {
    const entry = await PaymentPortalEntry.findById(entryId)
      .populate("vendor", "name vendorNumber companyName email phone primaryContactId")
      .populate("debitAccount", "name code category accountType description")
      .populate("creditAccount", "name code category accountType description")
      .populate("createdBy", "fullName email")
      .populate("reviewedBy", "fullName email")
      .lean();

    if (!entry) {
      const error = new Error("Payment entry not found.");
      error.statusCode = 404;
      throw error;
    }

    return entry;
  }

  /**
   * Maker updates a rejected entry and re-submits for approval
   */
  static async updateAndResubmitEntry(user, entryId, updateData, newUploadedDocuments = []) {
    const entry = await PaymentPortalEntry.findById(entryId);
    if (!entry) {
      const error = new Error("Payment entry not found.");
      error.statusCode = 404;
      throw error;
    }

    // Only creator (or Super Admin) can edit the entry
    const entryCreatorId = String(entry.createdBy?._id || entry.createdBy);
    const currentUserId = String(user.id || user._id);
    if (entryCreatorId !== currentUserId && user.role !== "ADMIN") {
      const error = new Error("You can only modify entries created by yourself.");
      error.statusCode = 403;
      throw error;
    }

    // Only REJECTED or DRAFT entries can be edited and re-submitted
    if (!["REJECTED", "DRAFT"].includes(entry.status)) {
      const error = new Error(
        `Cannot edit an entry with status '${entry.status}'. Only REJECTED or DRAFT entries can be updated.`
      );
      error.statusCode = 400;
      throw error;
    }

    const {
      vendor,
      amount,
      currency,
      debitAccount,
      creditAccount,
      paymentDate,
      referenceNumber,
      description,
      revisionNotes,
      keepExistingDocuments,
    } = updateData;

    if (vendor && mongoose.Types.ObjectId.isValid(vendor)) {
      const vendorDoc = await Supplier.findById(vendor).select("name companyName");
      if (vendorDoc) {
        entry.vendor = vendor;
        entry.vendorName = vendorDoc.name || vendorDoc.companyName;
      }
    }

    if (amount) {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        const error = new Error("Amount must be greater than zero.");
        error.statusCode = 400;
        throw error;
      }
      entry.amount = parsedAmount;
    }

    if (currency) entry.currency = currency;
    if (debitAccount) entry.debitAccount = debitAccount;
    if (creditAccount) entry.creditAccount = creditAccount;
    if (paymentDate) entry.paymentDate = new Date(paymentDate);
    if (referenceNumber !== undefined) entry.referenceNumber = referenceNumber;
    if (description !== undefined) entry.description = description;

    // Handle documents
    let docs = [];
    if (keepExistingDocuments) {
      // Parse retained document IDs or URLs
      let retained = keepExistingDocuments;
      if (typeof retained === "string") {
        try {
          retained = JSON.parse(retained);
        } catch (_) {
          retained = [];
        }
      }
      if (Array.isArray(retained)) {
        docs = entry.supportingDocuments.filter((d) =>
          retained.includes(String(d._id)) || retained.includes(d.url)
        );
      }
    } else {
      docs = entry.supportingDocuments || [];
    }

    if (newUploadedDocuments.length > 0) {
      docs = docs.concat(newUploadedDocuments);
    }

    if (!docs || docs.length === 0) {
      const error = new Error("At least one supporting document (invoice / bill receipt PDF or image) is mandatory.");
      error.statusCode = 400;
      throw error;
    }

    entry.supportingDocuments = docs;

    // Transition back to PENDING_APPROVAL
    entry.status = "PENDING_APPROVAL";
    entry.rejectionRemark = undefined; // Cleared from current active state
    entry.revisionCount = (entry.revisionCount || 0) + 1;

    entry.statusHistory.push({
      status: "PENDING_APPROVAL",
      actionBy: user.id,
      actionByName: user.fullName || "Financial Admin",
      actionRole: "FINANCEADMIN",
      timestamp: new Date(),
      remarks:
        revisionNotes ||
        `Revised and re-submitted for approval (Revision #${entry.revisionCount})`,
    });

    await entry.save();
    return entry;
  }

  /**
   * Delete entry (allowed only for DRAFT or creator if cancelled before review)
   */
  static async deleteEntry(user, entryId) {
    const entry = await PaymentPortalEntry.findById(entryId);
    if (!entry) {
      const error = new Error("Payment entry not found.");
      error.statusCode = 404;
      throw error;
    }

    const entryCreatorId = String(entry.createdBy?._id || entry.createdBy);
    const currentUserId = String(user.id || user._id);
    if (entryCreatorId !== currentUserId && user.role !== "ADMIN") {
      const error = new Error("You can only delete entries created by yourself.");
      error.statusCode = 403;
      throw error;
    }

    if (entry.status === "APPROVED") {
      const error = new Error("Approved payment entries cannot be deleted.");
      error.statusCode = 400;
      throw error;
    }

    await PaymentPortalEntry.findByIdAndDelete(entryId);
    return { message: "Payment entry deleted successfully." };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. APPROVALS WORKFLOW (CHECKER)
  // ─────────────────────────────────────────────────────────────

  /**
   * Approver Financial Admin accepts payment entry
   */
  static async approveEntry(approver, entryId, notes = "") {
    const entry = await PaymentPortalEntry.findById(entryId);
    if (!entry) {
      const error = new Error("Payment entry not found.");
      error.statusCode = 404;
      throw error;
    }

    if (entry.status !== "PENDING_APPROVAL") {
      const error = new Error(`Only entries with status 'PENDING_APPROVAL' can be approved.`);
      error.statusCode = 400;
      throw error;
    }

    // Segregation of duties: Maker cannot be Checker on their own entry (unless Super Admin)
    if (String(entry.createdBy) === String(approver.id) && approver.role !== "ADMIN") {
      const error = new Error("Segregation of duties violation: You cannot approve a payment entry that you created.");
      error.statusCode = 403;
      throw error;
    }

    entry.status = "APPROVED";
    entry.reviewedBy = approver.id;
    entry.reviewerName = approver.fullName || "Approver Financial Admin";
    entry.reviewedAt = new Date();
    entry.approvalNotes = notes;

    entry.statusHistory.push({
      status: "APPROVED",
      actionBy: approver.id,
      actionByName: approver.fullName || "Approver Financial Admin",
      actionRole: "FINANCEADMIN",
      timestamp: new Date(),
      remarks: notes || "Payment entry approved",
    });

    await entry.save();
    return entry;
  }

  /**
   * Approver Financial Admin rejects payment entry with mandatory remarks
   */
  static async rejectEntry(approver, entryId, remark) {
    if (!remark || !remark.trim()) {
      const error = new Error("A rejection remark is mandatory when rejecting a payment entry.");
      error.statusCode = 400;
      throw error;
    }

    const entry = await PaymentPortalEntry.findById(entryId);
    if (!entry) {
      const error = new Error("Payment entry not found.");
      error.statusCode = 404;
      throw error;
    }

    if (entry.status !== "PENDING_APPROVAL") {
      const error = new Error(`Only entries with status 'PENDING_APPROVAL' can be rejected.`);
      error.statusCode = 400;
      throw error;
    }

    // Segregation of duties
    if (String(entry.createdBy) === String(approver.id) && approver.role !== "ADMIN") {
      const error = new Error("Segregation of duties violation: You cannot reject a payment entry that you created.");
      error.statusCode = 403;
      throw error;
    }

    entry.status = "REJECTED";
    entry.reviewedBy = approver.id;
    entry.reviewerName = approver.fullName || "Approver Financial Admin";
    entry.reviewedAt = new Date();
    entry.rejectionRemark = remark.trim();

    entry.statusHistory.push({
      status: "REJECTED",
      actionBy: approver.id,
      actionByName: approver.fullName || "Approver Financial Admin",
      actionRole: "FINANCEADMIN",
      timestamp: new Date(),
      remarks: remark.trim(),
    });

    await entry.save();
    return entry;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. LOOKUPS / MASTER DATA
  // ─────────────────────────────────────────────────────────────

  /**
   * List active vendors/suppliers
   */
  static async getVendors() {
    return await Supplier.find({
      $or: [{ status: "ACTIVE" }, { status: { $exists: false } }],
    })
      .select("name companyName vendorNumber email phone category")
      .sort({ name: 1 })
      .lean();
  }

  /**
   * List chart of accounts split by Debit and Credit candidates
   */
  static async getAccounts() {
    const accounts = await AccountingCode.find({ accountStatus: "Active" })
      .select("code name category accountType")
      .sort({ code: 1 })
      .lean();

    // Debit candidates typically: Expense, Cost of Goods Sold, Accounts Payable, Fixed Asset, Current Asset
    // Credit candidates typically: Bank, Cash, Current Asset
    const debitAccounts = accounts.filter((a) =>
      [
        "Expense",
        "Accounts Payable",
        "Fixed Asset",
        "Other Current Asset",
        "Other Expense",
        "Stock",
        "Cost Of Goods Sold",
        "EXPENSE",
        "ASSET",
        "LIABILITY",
      ].includes(a.category) ||
      (a.accountType && /expense|payable|asset/i.test(a.accountType))
    );

    const creditAccounts = accounts.filter((a) =>
      [
        "Cash",
        "Bank",
        "Other Current Asset",
        "ASSET",
      ].includes(a.category) ||
      (a.accountType && /bank|cash/i.test(a.accountType)) ||
      /bank|cash|banco/i.test(a.name)
    );

    return {
      allAccounts: accounts,
      debitAccounts: debitAccounts.length > 0 ? debitAccounts : accounts,
      creditAccounts: creditAccounts.length > 0 ? creditAccounts : accounts,
    };
  }
}

module.exports = PaymentPortalService;

const jwt = require("jsonwebtoken");
const FinanceAdminPaymentAccess = require("../Model/FinanceAdminPaymentAccessModel");

/**
 * Middleware to verify that the logged-in Financial Admin has unlocked the portal via MPIN.
 * Expects the portal token in header: 'x-portal-token'
 */
const verifyPortalAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Primary authentication required.",
      });
    }

    // Super Admin has full administrative bypass
    if (req.user.role === "ADMIN") {
      req.portalAccess = {
        isSystemAdmin: true,
        hasEntryAccess: true,
        hasApprovalAccess: true,
      };
      return next();
    }

    if (req.user.role !== "FINANCEADMIN") {
      return res.status(403).json({
        success: false,
        message: "Payments Portal is only accessible to Financial Admins.",
      });
    }

    const portalToken =
      req.headers["x-portal-token"] || req.headers["x-payment-portal-token"];

    if (!portalToken) {
      return res.status(403).json({
        success: false,
        code: "MPIN_REQUIRED",
        message: "Portal MPIN verification required. Please enter your MPIN to continue.",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(portalToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({
        success: false,
        code: "PORTAL_TOKEN_EXPIRED",
        message: "Portal session expired or invalid. Please re-enter your MPIN.",
      });
    }

    if (
      !decoded.portalVerified ||
      String(decoded.financeAdminId) !== String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        code: "PORTAL_ACCESS_DENIED",
        message: "Invalid portal session token.",
      });
    }

    // Also check fresh DB status in case Admin locked or suspended access
    const access = await FinanceAdminPaymentAccess.findOne({
      financeAdminId: req.user.id,
    });

    if (!access || access.status !== "ACTIVE" || access.isLocked()) {
      return res.status(403).json({
        success: false,
        code: "PORTAL_ACCESS_LOCKED",
        message: "Your Payments Portal access is locked or inactive. Please contact Admin.",
      });
    }

    req.portalAccess = {
      financeAdminId: access.financeAdminId,
      hasEntryAccess: access.hasEntryAccess,
      hasApprovalAccess: access.hasApprovalAccess,
      fullName: access.fullName,
      email: access.email,
    };

    next();
  } catch (error) {
    console.error("[PaymentPortalAuth] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal error checking portal access.",
    });
  }
};

/**
 * Middleware ensuring user has entry creation permission
 */
const requireEntryAccess = (req, res, next) => {
  if (
    req.user?.role === "ADMIN" ||
    req.portalAccess?.hasEntryAccess === true
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "You do not have Entry Access for the Payments Portal.",
  });
};

/**
 * Middleware ensuring user has approval permission
 */
const requireApprovalAccess = (req, res, next) => {
  if (
    req.user?.role === "ADMIN" ||
    req.portalAccess?.hasApprovalAccess === true
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "You do not have Approval Access for the Payments Portal.",
  });
};

module.exports = {
  verifyPortalAccess,
  requireEntryAccess,
  requireApprovalAccess,
};

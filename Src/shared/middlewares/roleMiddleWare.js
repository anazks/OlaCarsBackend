exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      console.log(`[Authorization] Access Denied for role: ${req.user?.role}, Allowed: ${allowedRoles}`);
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};
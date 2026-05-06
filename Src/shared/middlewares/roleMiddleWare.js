exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    console.log(`[Authorization DEBUG] req.user:`, req.user ? req.user.role : 'NO USER');
    console.log(`[Authorization DEBUG] allowedRoles:`, allowedRoles);
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      console.log(`[Authorization] Access Denied for role: ${req.user?.role}, Allowed: ${allowedRoles}`);
      return res.status(403).json({ message: "Access denied", userRole: req.user?.role, allowedRoles });
    }
    next();
  };
};
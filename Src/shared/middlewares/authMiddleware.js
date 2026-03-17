const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      message: "No authentication token provided. Please log in." 
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: "Invalid or expired token. Please log in again.",
      error: error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN"
    });
  }
};

module.exports = { authenticate };
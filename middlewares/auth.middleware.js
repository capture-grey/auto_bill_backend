// middlewares/auth.middleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // adjust path if needed

/**
 * Authenticate user via JWT (cookie or header)
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const token =
      req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required (no token provided)",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError" ? "Token expired" : "Invalid token",
      });
    }

    // Find user by ID and exclude password
    const user = await User.findById(decoded.userId).select("password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id; // handy shortcut
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during authentication",
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} roles - allowed roles, e.g., ['admin']
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient permissions",
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };

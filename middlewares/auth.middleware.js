// middlewares/auth.middleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Authenticate user via JWT (cookie or header)
 */
const authenticate = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required (no token provided)",
      });
    }

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

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    req.user = user;
    req.userId = user._id;
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
// const authorize = (roles = []) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({
//         success: false,
//         message: "Forbidden: insufficient permissions",
//       });
//     }
//     next();
//   };
// };

const authorize = (roles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: No user info in token",
        });
      }

      // fetch  role
      const currentUser = await User.findById(req.user.id).select("role");
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // check role
      if (!roles.includes(currentUser.role)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: insufficient permissions",
          requiredRoles: roles,
          yourRole: currentUser.role,
        });
      }

      // new(current) role assign
      req.user.role = currentUser.role;
      next();
    } catch (err) {
      console.error("Authorization error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };
};

module.exports = { authenticate, authorize };

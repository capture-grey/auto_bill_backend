const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const {
  adminGeneralStats,
  adminTopUser,
  adminTimezoneUsage,
  userGeneralStats,
  userUsageStats,
} = require("../controllers/analytics.controller");

// Admin routes
router.get(
  "/admin/general",
  authenticate,
  authorize(["admin"]),
  adminGeneralStats
);
router.get("/admin/top-user", authenticate, authorize(["admin"]), adminTopUser);
router.get(
  "/admin/timezone-usage",
  authenticate,
  authorize(["admin"]),
  adminTimezoneUsage
);

// User routes
router.get("/user/:userId/general", authenticate, userGeneralStats);
router.get("/user/:userId/usage", authenticate, userUsageStats);

module.exports = router;

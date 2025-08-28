// routes/ed_billing.routes.js
const express = require("express");
const { edChargeUsersByIds } = require("../controllers/ed_billing.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

// Charge users using encrypted payment data
router.post(
  "/ed-billing/charge-users",
  authenticate,
  authorize(["admin"]),
  edChargeUsersByIds
);

module.exports = router;

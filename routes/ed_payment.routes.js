// routes/ed_payment.routes.js
const express = require("express");
const {
  edAddPaymentMethod,
  edGetPaymentData,
} = require("../controllers/ed_payment.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

// Add encrypted payment method
router.post("/:userId", authenticate, edAddPaymentMethod);

// Get decrypted payment data (admin only or user themselves)
router.get(
  "/users/:userId/ed-payment-methods/:methodId",
  authenticate,
  authorize(["admin"]),
  edGetPaymentData
);

module.exports = router;

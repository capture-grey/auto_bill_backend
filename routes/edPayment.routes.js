const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const { addEdPaymentMethod } = require("../controllers/edPayment.controller");

// Add ED payment method for a specific user
router.post("ed/:userId", authenticate, addEdPaymentMethod);

module.exports = router;

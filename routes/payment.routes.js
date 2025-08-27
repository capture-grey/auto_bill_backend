const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const { addPaymentMethod } = require("../controllers/payment.controller");

//add payment method
router.post("/:userId", authenticate, addPaymentMethod);

// Get payment methods

module.exports = router;

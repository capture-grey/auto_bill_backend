const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const {
  chargeAllUsers,
  chargeSelectedUsers,
} = require("../controllers/billing.controller");

// Charge all users
router.post("/manual", authenticate, chargeAllUsers);
router.post("/manual/users", authenticate, chargeSelectedUsers);

module.exports = router;

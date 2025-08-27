const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const {
  chargeSelectedUsers,
  chargeAllUsers,
} = require("../controllers/billing.controller");

// Charge all users
router.post("/manual", authenticate, chargeAllUsers);
// charge  specific users
router.post("/manual/users", authenticate, chargeSelectedUsers);

module.exports = router;

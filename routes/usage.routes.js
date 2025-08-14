const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const { startService, endService } = require("../controllers/usage.controller");

// Start service (userId as URL param)
router.post("/start/:userId", authenticate, startService);

// End service (userId as URL param)
router.post("/end/:userId", authenticate, endService);

module.exports = router;

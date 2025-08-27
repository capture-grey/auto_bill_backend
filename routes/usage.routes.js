const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const { startService, endService } = require("../controllers/usage.controller");

// start a service
router.post("/start/:userId", authenticate, startService);

// end a service
router.post("/end/:userId", authenticate, endService);

module.exports = router;

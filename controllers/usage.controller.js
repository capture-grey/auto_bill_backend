const Usage = require("../models/Usage");
const User = require("../models/User");

/**
 * Start a service (log usage start)
 * POST /api/usage/start/:userId
 */
const startService = async (req, res) => {
  try {
    const { userId } = req.params;
    const { activityType } = req.body;

    if (!userId || typeof activityType !== "number") {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid userId or activityType",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Ensure user has an Authorize.net customer profile before starting
    if (!user.authorizeNetProfileId) {
      return res.status(400).json({
        success: false,
        message:
          "User does not have a payment profile. Please add a payment method first.",
      });
    }

    // Check for ongoing activity of same type
    const existingUsage = await Usage.findOne({
      user: userId,
      activityType,
      endTime: null,
    });

    if (existingUsage) {
      return res.status(400).json({
        success: false,
        message: `User already has an ongoing activity of type ${activityType}`,
        ongoingUsage: existingUsage,
      });
    }

    const usage = new Usage({
      user: userId,
      activityType,
      startTime: new Date(),
    });

    await usage.save();
    res.status(201).json({ success: true, usage });
  } catch (err) {
    console.error("Start service error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * End a service (log usage end)
 * POST /api/usage/end/:userId
 */
const endService = async (req, res) => {
  try {
    const { userId } = req.params;
    const { activityType } = req.body;

    if (!userId || typeof activityType !== "number") {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid userId or activityType",
      });
    }

    const usage = await Usage.findOne({
      user: userId,
      activityType,
      endTime: null,
    }).sort({ startTime: -1 });

    if (!usage) {
      return res.status(400).json({
        success: false,
        message: `No ongoing activity of type ${activityType} found to end`,
      });
    }

    usage.endTime = new Date();
    usage.durationMinutes = Math.ceil(
      (usage.endTime - usage.startTime) / 60000
    );

    await usage.save();

    // Mark as unpaid so billing service can pick it up later
    usage.isPaid = false;
    await usage.save();

    res.status(200).json({ success: true, usage });
  } catch (err) {
    console.error("End service error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { startService, endService };

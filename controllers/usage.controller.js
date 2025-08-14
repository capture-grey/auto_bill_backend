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

    if (!userId || !activityType) {
      return res
        .status(400)
        .json({ success: false, message: "Missing userId or activityType" });
    }

    if (typeof activityType !== "number") {
      return res
        .status(400)
        .json({ success: false, message: "activityType must be a number" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if there's already an ongoing activity of this type
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

    if (!userId || !activityType) {
      return res
        .status(400)
        .json({ success: false, message: "Missing userId or activityType" });
    }

    if (typeof activityType !== "number") {
      return res
        .status(400)
        .json({ success: false, message: "activityType must be a number" });
    }

    // Find the latest ongoing usage
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

    // Check if already ended (shouldn't happen due to query, but just in case)
    if (usage.endTime) {
      return res.status(400).json({
        success: false,
        message: "This activity has already ended",
        usage,
      });
    }

    usage.endTime = new Date();
    usage.durationMinutes = Math.ceil(
      (usage.endTime - usage.startTime) / 60000
    );

    await usage.save();
    res.status(200).json({ success: true, usage });
  } catch (err) {
    console.error("End service error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { startService, endService };

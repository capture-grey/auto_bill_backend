const User = require("../models/User");
const Usage = require("../models/Usage");
const Transaction = require("../models/Transaction");
const { DateTime } = require("luxon");

/**
 * Admin: general stats
 */
const adminGeneralStats = async (req, res) => {
  try {
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const totalUsers = await User.countDocuments();
    const totalMinutes = await Usage.aggregate([
      { $match: { startTime: { $gte: from, $lte: to } } },
      { $group: { _id: null, sum: { $sum: "$durationMinutes" } } },
    ]);
    const totalRevenue = await Transaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: "success" } },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]);

    res.json({
      totalUsers,
      totalMinutes: totalMinutes[0]?.sum || 0,
      totalRevenue: totalRevenue[0]?.sum || 0,
    });
  } catch (err) {
    console.error("Admin general stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Admin: top paying user
 */
const adminTopUser = async (req, res) => {
  try {
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const topUser = await Transaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: "success" } },
      { $group: { _id: "$user", totalPaid: { $sum: "$amount" } } },
      { $sort: { totalPaid: -1 } },
      { $limit: 1 },
    ]);

    const user = topUser.length
      ? await User.findById(topUser[0]._id).select("name email")
      : null;
    res.json({ user, totalPaid: topUser[0]?.totalPaid || 0 });
  } catch (err) {
    console.error("Admin top user error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Admin: usage by timezone
 */
const adminTimezoneUsage = async (req, res) => {
  try {
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const users = await User.find();
    const timezoneUsage = {};

    for (const user of users) {
      const usage = await Usage.aggregate([
        { $match: { user: user._id, startTime: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
      ]);
      timezoneUsage[user.timezone] =
        (timezoneUsage[user.timezone] || 0) + (usage[0]?.total || 0);
    }

    res.json({ timezoneUsage });
  } catch (err) {
    console.error("Admin timezone usage error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * User: general stats
 */
const userGeneralStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const totalMinutesAgg = await Usage.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          startTime: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
    ]);

    const totalRevenueAgg = await Transaction.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          createdAt: { $gte: from, $lte: to },
          status: "success",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      totalMinutes: totalMinutesAgg[0]?.total || 0,
      totalBilled: totalRevenueAgg[0]?.total || 0,
    });
  } catch (err) {
    console.error("User general stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * User: daily usage & activity type grouped
 */
const userUsageStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const dailyUsage = await Usage.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          startTime: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$startTime" } },
            activityType: "$activityType",
          },
          totalMinutes: { $sum: "$durationMinutes" },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]);

    // reshape for easier reading
    const result = {};
    dailyUsage.forEach((d) => {
      if (!result[d._id.day]) result[d._id.day] = {};
      result[d._id.day][d._id.activityType] = d.totalMinutes;
    });

    res.json({ usage: result });
  } catch (err) {
    console.error("User usage stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  adminGeneralStats,
  adminTopUser,
  adminTimezoneUsage,
  userGeneralStats,
  userUsageStats,
};

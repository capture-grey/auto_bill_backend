//  controllers/stats.controller.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Usage = require("../models/Usage");
const Transaction = require("../models/Transaction");
const { DateTime } = require("luxon");

/**
 * Helper: get date range
 */
const getDateRange = (req, defaultDays) => {
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  return { from, to };
};

/**
 * =============================
 * ADMIN STATS
 * =============================
 */

/**
 * Admin: general stats
 */
const adminGeneralStats = async (req, res) => {
  try {
    const { from, to } = getDateRange(req, 30);

    const totalUsers = await User.countDocuments();

    const totalMinutesAgg = await Usage.aggregate([
      { $match: { startTime: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
    ]);

    const totalRevenueAgg = await Transaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      totalUsers,
      totalMinutes: totalMinutesAgg[0]?.total || 0,
      totalRevenue: totalRevenueAgg[0]?.total || 0,
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
    const { from, to } = getDateRange(req, 30);

    const topUserAgg = await Transaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: "success" } },
      { $group: { _id: "$user", totalPaid: { $sum: "$amount" } } },
      { $sort: { totalPaid: -1 } },
      { $limit: 1 },
    ]);

    let user = null;
    if (topUserAgg.length > 0) {
      user = await User.findById(topUserAgg[0]._id).select("name email");
    }

    res.json({ user, totalPaid: topUserAgg[0]?.totalPaid || 0 });
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
    const { from, to } = getDateRange(req, 30);

    // Group usage by user first
    const usageByUser = await Usage.aggregate([
      { $match: { startTime: { $gte: from, $lte: to } } },
      { $group: { _id: "$user", total: { $sum: "$durationMinutes" } } },
    ]);

    const users = await User.find(
      { _id: { $in: usageByUser.map((u) => u._id) } },
      "timezone"
    );

    const timezoneUsage = {};
    for (const entry of usageByUser) {
      const user = users.find((u) => u._id.equals(entry._id));
      const tz = user?.timezone || "Unknown";
      timezoneUsage[tz] = (timezoneUsage[tz] || 0) + entry.total;
    }

    res.json({ timezoneUsage });
  } catch (err) {
    console.error("Admin timezone usage error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * =============================
 * USER STATS
 * =============================
 */

/**
 * User: general stats
 */
const userGeneralStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = getDateRange(req, 7);

    const totalMinutesAgg = await Usage.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          startTime: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
    ]);

    const totalRevenueAgg = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
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
 * User: daily usage breakdown (by activity type, converted to user’s timezone)
 */
const userUsageStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = getDateRange(req, 7);

    const user = await User.findById(userId).select("timezone");
    const userTz = user?.timezone || "UTC";

    const dailyUsage = await Usage.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
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

    // Convert and reshape
    const result = {};
    dailyUsage.forEach((d) => {
      const localDay = DateTime.fromISO(d._id.day, { zone: "UTC" })
        .setZone(userTz)
        .toISODate();

      if (!result[localDay]) result[localDay] = {};
      result[localDay][d._id.activityType] = d.totalMinutes;
    });

    res.json({ usage: result });
  } catch (err) {
    console.error("User usage stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const userActivityTypeStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const aggResult = await Usage.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: "$activityType",
          totalMinutes: { $sum: "$durationMinutes" },
        },
      },
      { $sort: { totalMinutes: -1 } },
    ]);

    // Convert to key-value object
    const usageByActivity = {};
    aggResult.forEach((entry) => {
      usageByActivity[entry._id] = entry.totalMinutes;
    });

    res.json({ usageByActivity });
  } catch (err) {
    console.error("User activity type stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  adminGeneralStats,
  adminTopUser,
  adminTimezoneUsage,
  userGeneralStats,
  userUsageStats,
  userActivityTypeStats,
};

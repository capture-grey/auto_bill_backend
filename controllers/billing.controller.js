// controllers/billing.controller.js
const User = require("../models/User");
const Usage = require("../models/Usage");
const Transaction = require("../models/Transaction");

const RATE_PER_MINUTE = 0.1;

/**
 * Charge all users
 */
const chargeAllUsers = async (req, res) => {
  try {
    const note = req.body.note || "Automatic/manual billing";
    const users = await User.find();

    const results = [];

    for (const user of users) {
      const unpaidUsages = await Usage.find({ user: user._id, isPaid: false });
      const totalMinutes = unpaidUsages.reduce(
        (sum, u) => sum + (u.durationMinutes || 0),
        0
      );
      if (totalMinutes === 0) continue;

      const defaultPayment = user.paymentMethods.find((pm) => pm.isDefault);
      if (!defaultPayment) continue;

      const amount = totalMinutes * RATE_PER_MINUTE;

      const transaction = new Transaction({
        user: user._id,
        usageItems: unpaidUsages.map((u) => u._id),
        amount,
        methodType: defaultPayment.methodType,
        paymentToken: defaultPayment.token, // Add this line
        transactionId: "simulated_txn_" + Date.now(),
        status: "success",
        note,
      });

      await transaction.save();

      // Rest of the function remains the same
      // ...
    }

    res.status(200).json({ success: true, results });
  } catch (err) {
    console.error("Charge all users error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
/**
 * Charge selected users
 */
const chargeSelectedUsers = async (req, res) => {
  try {
    const { userIds, note } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "userIds required" });
    }

    const results = [];

    for (const id of userIds) {
      const user = await User.findById(id);
      if (!user) continue;

      const unpaidUsages = await Usage.find({ user: id, isPaid: false });
      const totalMinutes = unpaidUsages.reduce(
        (sum, u) => sum + (u.durationMinutes || 0),
        0
      );
      if (totalMinutes === 0) continue;

      const defaultPayment = user.paymentMethods.find((pm) => pm.isDefault);
      if (!defaultPayment) continue;

      const amount = totalMinutes * RATE_PER_MINUTE;

      const transaction = new Transaction({
        user: user._id,
        usageItems: unpaidUsages.map((u) => u._id),
        amount,
        methodType: defaultPayment.methodType,
        paymentToken: defaultPayment.token, // Add this line
        transactionId: "simulated_txn_" + Date.now(),
        status: "success",
        note: note || "Manual charge selected users",
      });

      await transaction.save();

      // Mark usages as paid
      for (let usage of unpaidUsages) {
        usage.isPaid = true;
        usage.paymentReference = transaction.transactionId;
        await usage.save();
      }

      results.push({
        user: user.email,
        amount,
        paidUsages: unpaidUsages.length,
        paymentMethod: defaultPayment.methodType,
      });
    }

    res.status(200).json({ success: true, results });
  } catch (err) {
    console.error("Charge selected users error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
module.exports = { chargeAllUsers, chargeSelectedUsers };

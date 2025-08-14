const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    usageItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Usage",
      },
    ],
    amount: {
      type: Number,
      required: true,
    },
    methodType: {
      type: String,
      enum: ["card", "bank"],
      required: true,
    },
    transactionId: {
      type: String, // Authorize.net transaction ID
      required: true,
    },
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      required: true,
      default: "pending",
    },
    responseCode: {
      type: String,
      default: null,
    },
    responseMessage: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const Transaction = mongoose.model("Transaction", transactionSchema);
module.exports = Transaction;

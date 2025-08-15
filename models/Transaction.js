// models/Transaction.js
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Array of related usage items that this transaction is paying for
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

    /**
     * Payment Method Information
     * - methodType: card or bank
     * - customerProfileId: Authorize.net Customer Profile ID
     * - paymentProfileId: Authorize.net Payment Profile ID (card or bank)
     */
    methodType: {
      type: String,
      enum: ["card", "bank"],
      required: true,
    },
    customerProfileId: {
      type: String, // Authorize.net customerProfileId
      required: true,
    },
    paymentProfileId: {
      type: String, // Authorize.net paymentProfileId (tokenized card or bank account)
      required: true,
    },

    /**
     * Authorize.net Transaction Details
     */
    transactionId: {
      type: String, // Authorize.net transaction ID from the charge
      required: true,
    },
    authCode: {
      type: String, // Authorization code from Authorize.net (if success)
      default: null,
    },
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      required: true,
      default: "pending",
    },
    responseCode: {
      type: String, // Authorize.net response code (e.g., 1 = Approved, 2 = Declined)
      default: null,
    },
    responseMessage: {
      type: String, // Response message from Authorize.net
      default: null,
    },
    failureReason: {
      type: String, // Store failure message if transaction failed
      default: null,
    },

    note: {
      type: String, // Manual note from billing run
      default: null,
    },
  },
  { timestamps: true }
);

const Transaction = mongoose.model("Transaction", transactionSchema);
module.exports = Transaction;

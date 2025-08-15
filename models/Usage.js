const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    activityType: {
      type: Number, // type of activity, e.g., 1 = video, 2 = call, etc.
      required: true,
      default: 1,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null, // still running if null
    },
    durationMinutes: {
      type: Number,
      default: 0, // calculated when endTime is set
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    paymentReference: {
      type: String, // Authorize.net transaction ID if paid
      default: null,
    },

    // 🔹 New fields for payment profile tracking
    methodType: {
      type: String, // 'card' or 'bank'
      enum: ["card", "bank"],
      default: null,
    },
    customerProfileId: {
      type: String, // Authorize.net Customer Profile ID
      default: null,
    },
    paymentProfileId: {
      type: String, // Authorize.net Payment Profile ID
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to calculate duration if endTime is set
usageSchema.pre("save", function (next) {
  if (this.endTime && !this.durationMinutes) {
    const diffMs = this.endTime - this.startTime;
    this.durationMinutes = Math.ceil(diffMs / 60000); // ms → minutes
  }
  next();
});

const Usage = mongoose.model("Usage", usageSchema);
module.exports = Usage;

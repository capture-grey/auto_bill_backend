const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    activityType: {
      type: Number, // changed from String to Number
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
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to calculate duration if endTime is set
usageSchema.pre("save", function (next) {
  if (this.endTime && !this.durationMinutes) {
    const diffMs = this.endTime - this.startTime;
    this.durationMinutes = Math.ceil(diffMs / 60000); // milliseconds → minutes
  }
  next();
});

// Compound index to quickly find ongoing usage
//usageSchema.index({ user: 1, activityType: 1, endTime: 1 });

const Usage = mongoose.model("Usage", usageSchema);
module.exports = Usage;

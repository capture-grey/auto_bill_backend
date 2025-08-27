const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    activityType: { type: Number, required: true, default: 1 },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date, default: null },
    durationMinutes: { type: Number, default: 0 },
    isPaid: { type: Boolean, default: false },
    paymentReference: { type: String, default: null },
    lastPaidAt: { type: Date, default: null },
    methodType: { type: String, enum: ["card", "bank"], default: null },
    customerProfileId: { type: String, default: null },
    paymentProfileId: { type: String, default: null },
  },
  { timestamps: true }
);

// hook to calculate duration if endTime is set
usageSchema.pre("save", function (next) {
  if (this.endTime && !this.durationMinutes) {
    const diffMs = this.endTime - this.startTime;
    this.durationMinutes = Math.ceil(diffMs / 60000);
  }
  next();
});

const Usage = mongoose.model("Usage", usageSchema);
module.exports = Usage;

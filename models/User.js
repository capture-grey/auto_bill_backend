const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const paymentMethodSchema = new mongoose.Schema(
  {
    methodType: {
      type: String,
      enum: ["card", "bank"],
      required: true,
    },
    // Authorize.net payment token
    token: {
      type: String,
      required: true,
    },
    // Card fields
    last4: {
      type: String,
      required: function () {
        return this.methodType === "card";
      },
    },
    brand: {
      type: String,
      required: function () {
        return this.methodType === "card";
      },
    },
    expiry: {
      type: String,
      required: function () {
        return this.methodType === "card";
      },
    },
    // Bank fields
    accountType: {
      type: String,
      enum: ["checking", "savings"],
      required: function () {
        return this.methodType === "bank";
      },
    },
    routingNumber: {
      type: String,
      required: function () {
        return this.methodType === "bank";
      },
    },
    accountHolderName: {
      type: String,
      required: function () {
        return this.methodType === "bank";
      },
    },
    bankName: String,
    // Common fields
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
      minlength: [8, "Password must be at least 8 characters long"],
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    timezone: {
      type: String,
      required: true,
      default: "UTC",
    },
    paymentMethods: [paymentMethodSchema],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

// Password hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get default payment method
userSchema.methods.getDefaultPaymentMethod = function () {
  return this.paymentMethods.find((method) => method.isDefault);
};

// Add payment method
userSchema.methods.addPaymentMethod = async function (methodData) {
  if (methodData.isDefault) {
    this.paymentMethods.forEach((method) => {
      method.isDefault = false;
    });
  }
  this.paymentMethods.push(methodData);
  return this.save();
};

// Set default payment method
userSchema.methods.setDefaultPaymentMethod = async function (methodId) {
  let found = false;
  this.paymentMethods.forEach((method) => {
    if (method._id.toString() === methodId) {
      method.isDefault = true;
      found = true;
    } else {
      method.isDefault = false;
    }
  });
  if (!found) throw new Error("Payment method not found");
  return this.save();
};

module.exports = mongoose.model("User", userSchema);

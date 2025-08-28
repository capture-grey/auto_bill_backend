const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// --- Encryption config ---
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(String(process.env.ENCRYPTION_KEY || "my_secret_key"))
  .digest("base64")
  .substr(0, 32); // AES-256 key
const ALGORITHM = "aes-256-cbc";

// --- Encrypted Payment Method Schema ---
const edPaymentMethodSchema = new mongoose.Schema(
  {
    methodType: {
      type: String,
      enum: ["card", "bank"],
      required: true,
    },
    encryptedData: { type: String, required: true },
    iv: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// --- Normal Payment Method Schema (for display) ---
const paymentMethodSchema = new mongoose.Schema(
  {
    methodType: { type: String, enum: ["card", "bank"], required: true },
    paymentProfileId: { type: String, required: true },
    last4: String,
    brand: String,
    expiryMonth: String,
    expiryYear: String,
    accountType: { type: String, enum: ["checking", "savings"] },
    bankName: String,
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// --- User Schema ---
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Invalid email"],
    },
    password: { type: String, required: true, select: false, minlength: 8 },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    timezone: { type: String, default: "UTC" },
    customerProfileId: { type: String, default: null }, // Authorize.net
    paymentMethods: [paymentMethodSchema], // for display
    edPaymentMethods: [edPaymentMethodSchema], // encrypted raw data
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.edPaymentMethods; // never expose encrypted data
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.edPaymentMethods;
        return ret;
      },
    },
  }
);

// --- Password hashing ---
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

// --- Password comparison ---
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// --- Default payment method ---
userSchema.methods.getDefaultPaymentMethod = function () {
  return this.paymentMethods.find((method) => method.isDefault);
};

// --- Add payment method (display) ---
userSchema.methods.addPaymentMethod = async function (methodData) {
  if (methodData.isDefault)
    this.paymentMethods.forEach((m) => (m.isDefault = false));
  this.paymentMethods.push(methodData);
  return this.save();
};

// --- Set default payment method ---
userSchema.methods.setDefaultPaymentMethod = async function (methodId) {
  let found = false;
  this.paymentMethods.forEach((m) => {
    if (m._id.toString() === methodId) {
      m.isDefault = true;
      found = true;
    } else m.isDefault = false;
  });
  if (!found) throw new Error("Payment method not found");
  return this.save();
};

// --- Encrypt raw data ---
userSchema.methods.encryptData = function (plainText) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  return { encryptedData: encrypted, iv: iv.toString("base64") };
};

// --- Decrypt data ---
userSchema.methods.decryptData = function ({ encryptedData, iv }) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(iv, "base64")
  );
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

module.exports = mongoose.model("User", userSchema);

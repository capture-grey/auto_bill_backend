// controllers/ed_payment.controller.js
const User = require("../models/User");
const { APIContracts, APIControllers } = require("authorizenet");
const authorizeConfig = require("../config/authorize");
const crypto = require("crypto");

// Encryption config (should match your user model)
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(String(process.env.ENCRYPTION_KEY || "my_secret_key"))
  .digest("base64")
  .substr(0, 32);
const ALGORITHM = "aes-256-cbc";

// Helper function to encrypt data
const encryptData = (plainText) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  return { encryptedData: encrypted, iv: iv.toString("base64") };
};

// Helper function to decrypt data
const decryptData = (encryptedData, ivBase64) => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(ivBase64, "base64")
  );
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

// Helper function to determine card brand
function getCardBrand(cardNumber) {
  const cardPatterns = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    diners: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
    jcb: /^(?:2131|1800|35\d{3})\d{11}$/,
  };

  const cleanedNumber = cardNumber.replace(/\s+/g, "");

  for (const [brand, pattern] of Object.entries(cardPatterns)) {
    if (pattern.test(cleanedNumber)) {
      return brand;
    }
  }
  return "Unknown";
}

/**
 * Add encrypted payment method
 */
const edAddPaymentMethod = async (req, res) => {
  try {
    console.log("DEBUG: Incoming edAddPaymentMethod request body:", req.body);

    const { userId } = req.params;
    const {
      methodType, // 'card' or 'bank'
      isDefault = false,
      // Raw payment data that will be encrypted
      cardNumber,
      expiry, // MMYY format
      cardCode, // CVV
      accountType,
      routingNumber,
      accountNumber,
      accountHolderName,
      bankName,
    } = req.body;

    // Validation - FIXED: Check the actual incoming fields, not the wrong ones
    if (!methodType) {
      return res.status(400).json({
        success: false,
        message: "methodType is required",
      });
    }

    if (methodType === "card") {
      if (!cardNumber || !expiry || !cardCode) {
        return res.status(400).json({
          success: false,
          message:
            "cardNumber, expiry, and cardCode are required for card payments",
        });
      }
    } else if (methodType === "bank") {
      if (
        !accountType ||
        !routingNumber ||
        !accountNumber ||
        !accountHolderName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "accountType, routingNumber, accountNumber, and accountHolderName are required for bank payments",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid methodType. Must be 'card' or 'bank'",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prepare raw data for encryption
    const rawPaymentData = {
      methodType,
      timestamp: new Date().toISOString(),
      data:
        methodType === "card"
          ? {
              cardNumber,
              expiry,
              cardCode,
            }
          : {
              accountType,
              routingNumber,
              accountNumber,
              accountHolderName,
              bankName: bankName || "",
            },
    };

    // Encrypt the raw payment data
    const { encryptedData, iv } = encryptData(JSON.stringify(rawPaymentData));

    // Create display data (non-sensitive information) - FIXED: Generate a mock paymentProfileId
    const paymentProfileId = `ed_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const displayData = {
      methodType,
      paymentProfileId, // Required by your schema
      isDefault,
      last4:
        methodType === "card" ? cardNumber.slice(-4) : accountNumber.slice(-4),
      ...(methodType === "card"
        ? {
            brand: getCardBrand(cardNumber),
            expiryMonth: expiry.slice(0, 2),
            expiryYear: `20${expiry.slice(2)}`,
          }
        : {
            accountType: accountType.toLowerCase(),
            bankName: bankName || "",
          }),
    };

    // Add to user's encrypted payment methods
    user.edPaymentMethods.push({
      methodType,
      encryptedData,
      iv,
      isDefault,
      createdAt: new Date(),
    });

    // Also add to regular payment methods for display
    if (isDefault) {
      user.paymentMethods.forEach((method) => {
        method.isDefault = false;
      });
    }

    user.paymentMethods.push(displayData);

    await user.save();

    res.status(201).json({
      success: true,
      message: "Encrypted payment method added successfully",
      paymentMethods: user.paymentMethods,
      encryptedMethodId:
        user.edPaymentMethods[user.edPaymentMethods.length - 1]._id,
    });
  } catch (err) {
    console.error("ED Add payment method error:", err);

    // More specific error handling
    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: err.message,
        details: Object.keys(err.errors).map((key) => ({
          field: key,
          message: err.errors[key].message,
        })),
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

/**
 * Get decrypted payment data (for billing purposes only)
 * This should be highly secured and only accessible by admins
 */
const edGetPaymentData = async (req, res) => {
  try {
    const { userId, methodId } = req.params;

    // Authorization check - only allow admins
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Admin access required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const encryptedMethod = user.edPaymentMethods.id(methodId);
    if (!encryptedMethod) {
      return res.status(404).json({
        success: false,
        message: "Encrypted payment method not found",
      });
    }

    // Decrypt the data
    const decryptedData = decryptData(
      encryptedMethod.encryptedData,
      encryptedMethod.iv
    );
    const paymentData = JSON.parse(decryptedData);

    res.status(200).json({
      success: true,
      paymentData,
      methodType: encryptedMethod.methodType,
    });
  } catch (err) {
    console.error("ED Get payment data error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

module.exports = { edAddPaymentMethod, edGetPaymentData };

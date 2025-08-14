const User = require("../models/User");
const { APIContracts } = require("authorizenet");

const addPaymentMethod = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      methodType, // 'card' or 'bank'
      paymentToken,
      isDefault = false,
      // Card fields
      last4,
      brand,
      expiry,
      // Bank fields
      accountType,
      routingNumber,
      accountHolderName,
      bankName,
    } = req.body;

    // Validate common fields
    if (!paymentToken || !methodType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Validate card-specific fields
    if (methodType === "card" && (!last4 || !brand || !expiry)) {
      return res.status(400).json({
        success: false,
        message: "Missing card details",
      });
    }

    // Validate bank-specific fields
    if (
      methodType === "bank" &&
      (!accountType || !routingNumber || !accountHolderName)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing bank details",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prepare payment method data
    const paymentData = {
      methodType,
      token: paymentToken,
      isDefault,
    };

    // Add type-specific fields
    if (methodType === "card") {
      paymentData.last4 = last4;
      paymentData.brand = brand;
      paymentData.expiry = expiry;
    } else {
      paymentData.accountType = accountType;
      paymentData.routingNumber = routingNumber;
      paymentData.accountHolderName = accountHolderName;
      paymentData.bankName = bankName || "";
    }

    // Add new payment method
    await user.addPaymentMethod(paymentData);

    res.status(201).json({
      success: true,
      paymentMethods: user.paymentMethods,
    });
  } catch (err) {
    console.error("Add payment method error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to add payment method",
    });
  }
};

module.exports = { addPaymentMethod };

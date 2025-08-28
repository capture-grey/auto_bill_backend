// controllers/payment.controller.js
const User = require("../models/User");
const { APIContracts, APIControllers } = require("authorizenet");
const authorizeConfig = require("../config/authorize");

// Helper function to determine card brand (moved outside the main function)
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

const addPaymentMethod = async (req, res) => {
  try {
    console.log("DEBUG: Incoming addPaymentMethod request body:", req.body);

    const { userId } = req.params;
    const {
      methodType, // 'card' or 'bank'
      isDefault = false,
      cardNumber,
      expiry, // Expected format: "MMYY" e.g., "1226" for December 2026
      cardCode, // CVV
      accountType,
      routingNumber,
      accountNumber, // This was missing from your request!
      accountHolderName,
      bankName,
    } = req.body;

    // Validation
    if (!methodType) {
      return res.status(400).json({
        success: false,
        message: "methodType is required",
      });
    }

    if (methodType === "card") {
      if (!cardNumber) {
        return res.status(400).json({
          success: false,
          message: "cardNumber is required for card payments",
        });
      }
      if (!expiry) {
        return res.status(400).json({
          success: false,
          message: "expiry is required for card payments",
        });
      }
      if (!cardCode) {
        return res.status(400).json({
          success: false,
          message: "cardCode (CVV) is required for card payments",
        });
      }
    } else if (methodType === "bank") {
      // Fixed validation - check for accountNumber
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

    // Step 1: Ensure Customer Profile exists
    let customerProfileId = user.customerProfileId;
    if (!customerProfileId) {
      const merchantCustomerId = require("crypto")
        .createHash("md5")
        .update(user._id.toString())
        .digest("hex")
        .substring(0, 20);

      console.log(
        "DEBUG: Creating new Authorize.net customer profile for user:",
        user._id
      );

      const customerProfile = new APIContracts.CustomerProfileType();
      customerProfile.setMerchantCustomerId(merchantCustomerId);

      // Split name into first/last
      const nameParts = user.name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || firstName;

      customerProfile.setDescription(
        `Profile for ${firstName} ${lastName}`.substring(0, 255)
      );
      customerProfile.setEmail(user.email.substring(0, 255));

      const createRequest = new APIContracts.CreateCustomerProfileRequest();
      createRequest.setMerchantAuthentication(
        authorizeConfig.getMerchantAuthentication()
      );
      createRequest.setProfile(customerProfile);

      const ctrl = new APIControllers.CreateCustomerProfileController(
        createRequest.getJSON()
      );
      ctrl.setEnvironment(authorizeConfig.getEndpoint());

      const apiResponse = await new Promise((resolve, reject) => {
        ctrl.execute(() => {
          const response = ctrl.getResponse();
          resolve(response);
        });
      });

      console.log(
        "DEBUG: Authorize.net createCustomerProfile response:",
        apiResponse
      );

      if (
        !apiResponse ||
        apiResponse.messages.resultCode !== APIContracts.MessageTypeEnum.OK
      ) {
        const errorMsg =
          apiResponse?.messages?.message[0]?.text ||
          "Unknown error creating customer profile";
        return res.status(500).json({
          success: false,
          message: "Failed to create customer profile",
          error: errorMsg,
        });
      }

      customerProfileId = apiResponse.customerProfileId;
      user.customerProfileId = customerProfileId;
      await user.save();
      console.log("DEBUG: Created customerProfileId:", customerProfileId);
    }

    // Step 2: Create payment profile
    const paymentProfile = new APIContracts.CustomerPaymentProfileType();

    // Set billing address
    const nameParts = user.name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || firstName;

    const billTo = new APIContracts.CustomerAddressType();
    billTo.setFirstName(firstName.substring(0, 50));
    billTo.setLastName(lastName.substring(0, 50));
    paymentProfile.setBillTo(billTo);

    // Set payment method
    if (methodType === "card") {
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber(cardNumber.replace(/\s+/g, "")); // Remove spaces
      creditCard.setExpirationDate(expiry);
      creditCard.setCardCode(cardCode);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setCreditCard(creditCard);
      paymentProfile.setPayment(paymentType);
    } else if (methodType === "bank") {
      const bankAccount = new APIContracts.BankAccountType();
      bankAccount.setAccountType(accountType.toLowerCase());
      bankAccount.setRoutingNumber(routingNumber);
      bankAccount.setAccountNumber(accountNumber); // Now using accountNumber
      bankAccount.setNameOnAccount(accountHolderName);
      if (bankName) bankAccount.setBankName(bankName);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setBankAccount(bankAccount);
      paymentProfile.setPayment(paymentType);
    }

    paymentProfile.setDefaultPaymentProfile(isDefault);

    // Create payment profile request
    const createPaymentProfileRequest =
      new APIContracts.CreateCustomerPaymentProfileRequest();
    createPaymentProfileRequest.setMerchantAuthentication(
      authorizeConfig.getMerchantAuthentication()
    );
    createPaymentProfileRequest.setCustomerProfileId(customerProfileId);
    createPaymentProfileRequest.setPaymentProfile(paymentProfile);
    createPaymentProfileRequest.setValidationMode(
      APIContracts.ValidationModeEnum.TESTMODE
    );

    console.log(
      "DEBUG: Sending payment profile creation request to Authorize.net"
    );

    const paymentCtrl =
      new APIControllers.CreateCustomerPaymentProfileController(
        createPaymentProfileRequest.getJSON()
      );
    paymentCtrl.setEnvironment(authorizeConfig.getEndpoint());

    const paymentProfileResponse = await new Promise((resolve, reject) => {
      paymentCtrl.execute(() => {
        const response = paymentCtrl.getResponse();
        resolve(response);
      });
    });

    console.log(
      "DEBUG: Authorize.net createCustomerPaymentProfile response:",
      paymentProfileResponse
    );

    if (
      !paymentProfileResponse ||
      paymentProfileResponse.messages.resultCode !==
        APIContracts.MessageTypeEnum.OK
    ) {
      const errorMsg =
        paymentProfileResponse?.messages?.message[0]?.text ||
        "Unknown error adding payment profile";
      return res.status(500).json({
        success: false,
        message: "Failed to add payment method to Authorize.net",
        error: errorMsg,
      });
    }

    const customerPaymentProfileId =
      paymentProfileResponse.customerPaymentProfileId;

    // Step 3: Save in user database
    const paymentDataToSave = {
      methodType,
      paymentProfileId: customerPaymentProfileId,
      isDefault,
    };

    if (methodType === "card") {
      paymentDataToSave.last4 = cardNumber.slice(-4);
      paymentDataToSave.expiryMonth = expiry.slice(0, 2);
      paymentDataToSave.expiryYear = `20${expiry.slice(2)}`; // Convert YY to YYYY
      paymentDataToSave.brand = getCardBrand(cardNumber); // Fixed: using the helper function directly
    } else {
      paymentDataToSave.accountType = accountType.toLowerCase();
      paymentDataToSave.routingNumber = routingNumber;
      paymentDataToSave.accountNumber = accountNumber; // Store account number (last 4 digits only for security)
      paymentDataToSave.accountHolderName = accountHolderName;
      paymentDataToSave.bankName = bankName || "";
    }

    await user.addPaymentMethod(paymentDataToSave);

    // Refresh user to get updated payment methods
    const updatedUser = await User.findById(userId);

    res.status(201).json({
      success: true,
      message: "Payment method added successfully",
      paymentMethods: updatedUser.paymentMethods,
      customerPaymentProfileId,
    });
  } catch (err) {
    console.error("Add payment method error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

module.exports = { addPaymentMethod };

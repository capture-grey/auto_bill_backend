// controllers/edPayment.controller.js
const User = require("../models/User");
const { APIContracts, APIControllers } = require("authorizenet");
const authorizeConfig = require("../config/authorize");
const crypto = require("crypto");

const addEdPaymentMethod = async (req, res) => {
  try {
    const { userId } = req.params; // take from URL param
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const {
      methodType,
      isDefault = false,
      cardNumber,
      expiry,
      cardCode,
      accountType,
      routingNumber,
      accountNumber,
      accountHolderName,
      bankName,
    } = req.body;

    if (!methodType)
      return res
        .status(400)
        .json({ success: false, message: "methodType is required" });

    // Ensure customer profile exists
    let customerProfileId = user.customerProfileId;
    if (!customerProfileId) {
      const merchantCustomerId = crypto
        .createHash("md5")
        .update(user._id.toString())
        .digest("hex")
        .substring(0, 20);

      const customerProfile = new APIContracts.CustomerProfileType();
      customerProfile.setMerchantCustomerId(merchantCustomerId);

      const nameParts = user.name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts[1] || nameParts[0];

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
      await new Promise((resolve) => ctrl.execute(() => resolve()));
      const apiResponse = ctrl.getResponse();

      if (
        !apiResponse ||
        apiResponse.messages.resultCode !== APIContracts.MessageTypeEnum.OK
      ) {
        const errorMsg =
          apiResponse?.messages?.message[0]?.text ||
          "Error creating customer profile";
        return res.status(500).json({
          success: false,
          message: "Failed to create customer profile",
          error: errorMsg,
        });
      }

      customerProfileId = apiResponse.customerProfileId;
      user.customerProfileId = customerProfileId;
      await user.save();
    }

    // Create payment profile
    const paymentProfile = new APIContracts.CustomerPaymentProfileType();
    const nameParts = user.name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts[1] || nameParts[0];

    const billTo = new APIContracts.CustomerAddressType();
    billTo.setFirstName(firstName);
    billTo.setLastName(lastName);
    paymentProfile.setBillTo(billTo);

    if (methodType === "card") {
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber(cardNumber);
      creditCard.setExpirationDate(expiry);
      if (cardCode) creditCard.setCardCode(cardCode);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setCreditCard(creditCard);
      paymentProfile.setPayment(paymentType);
    } else if (methodType === "bank") {
      const bankAccount = new APIContracts.BankAccountType();
      bankAccount.setAccountType((accountType || "").toUpperCase());
      bankAccount.setRoutingNumber(routingNumber);
      bankAccount.setAccountNumber(accountNumber);
      bankAccount.setNameOnAccount(accountHolderName);
      if (bankName) bankAccount.setBankName(bankName);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setBankAccount(bankAccount);
      paymentProfile.setPayment(paymentType);
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid methodType" });
    }

    paymentProfile.setDefaultPaymentProfile(isDefault);

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

    const paymentCtrl =
      new APIControllers.CreateCustomerPaymentProfileController(
        createPaymentProfileRequest.getJSON()
      );
    paymentCtrl.setEnvironment(authorizeConfig.getEndpoint());
    await new Promise((resolve) => paymentCtrl.execute(() => resolve()));
    const paymentProfileResponse = paymentCtrl.getResponse();

    if (
      !paymentProfileResponse ||
      paymentProfileResponse.messages.resultCode !==
        APIContracts.MessageTypeEnum.OK
    ) {
      const errorMsg =
        paymentProfileResponse?.messages?.message[0]?.text ||
        "Error adding payment profile";
      return res.status(500).json({
        success: false,
        message: "Failed to add payment method",
        error: errorMsg,
      });
    }

    const customerPaymentProfileId =
      paymentProfileResponse.customerPaymentProfileId;

    const paymentDataToSave = {
      methodType,
      paymentProfileId: customerPaymentProfileId,
      isDefault,
    };
    if (methodType === "card") {
      paymentDataToSave.last4 = cardNumber.slice(-4);
      paymentDataToSave.expiryMonth = expiry.slice(0, 2);
      paymentDataToSave.expiryYear = expiry.slice(2);
    } else {
      paymentDataToSave.accountType = accountType.toLowerCase();
      paymentDataToSave.routingNumber = routingNumber;
      paymentDataToSave.accountHolderName = accountHolderName;
      paymentDataToSave.bankName = bankName || "";
    }

    await user.addPaymentMethod(paymentDataToSave);

    res
      .status(201)
      .json({ success: true, paymentMethods: user.paymentMethods });
  } catch (err) {
    console.error("Add ED payment method error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to add payment method",
      error: err.message,
    });
  }
};

module.exports = { addEdPaymentMethod };

// controllers/paymentMethod.controller.js
const User = require("../models/User");
const { APIContracts, APIControllers } = require("authorizenet");
const authorizeConfig = require("../config/authorize");

const addPaymentMethod = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      methodType, // 'card' or 'bank'
      isDefault = false,
      cardNumber,
      expiry, // "MMYY"
      cardCode,
      accountType, // 'checking' or 'savings'
      routingNumber,
      accountNumber,
      accountHolderName,
      bankName,
    } = req.body;

    console.log("DEBUG: Incoming addPaymentMethod request body:", req.body);

    if (!methodType) {
      return res
        .status(400)
        .json({ success: false, message: "methodType is required" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    let customerProfileId = user.authorizeNetCustomerProfileId;

    // Step 1: Create or log existing customer profile
    if (!customerProfileId) {
      console.log(
        `DEBUG: Creating new Authorize.net customer profile for user: ${user._id}`
      );

      const merchantCustomerId = require("crypto")
        .createHash("md5")
        .update(user._id.toString())
        .digest("hex")
        .substring(0, 20);

      const profile = new APIContracts.CustomerProfileType();
      profile.setMerchantCustomerId(merchantCustomerId);
      profile.setDescription(`Profile for ${user.name}`);
      profile.setEmail(
        user.email ? user.email.substring(0, 255) : "noemail@example.com"
      );

      console.log("DEBUG: CustomerProfileType being sent:", profile);

      const createRequest = new APIContracts.CreateCustomerProfileRequest();
      createRequest.setMerchantAuthentication(
        authorizeConfig.getMerchantAuthentication()
      );
      createRequest.setProfile(profile);

      const ctrl = new APIControllers.CreateCustomerProfileController(
        createRequest.getJSON()
      );
      ctrl.setEnvironment(authorizeConfig.getEndpoint());

      await new Promise((resolve) => ctrl.execute(() => resolve()));
      const apiResponse = ctrl.getResponse();

      console.log(
        "DEBUG: Full Authorize.net createCustomerProfile response:",
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
          authorizeNetResponse: apiResponse,
          error: errorMsg,
        });
      }

      customerProfileId = apiResponse.customerProfileId;
      user.authorizeNetCustomerProfileId = customerProfileId;
      await user.save();

      console.log("DEBUG: Created customerProfileId:", customerProfileId);
    } else {
      console.log(
        "DEBUG: Using existing customerProfileId:",
        customerProfileId
      );
    }

    // Step 2: Prepare payment profile
    let paymentTypeData = {};
    if (methodType === "card") {
      if (!cardNumber || !expiry)
        return res
          .status(400)
          .json({
            success: false,
            message: "cardNumber and expiry are required",
          });

      paymentTypeData = {
        cardNumber,
        expiry,
        cardCode: cardCode || undefined,
      };

      console.log("DEBUG: Card paymentTypeData to send:", paymentTypeData);
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
            "accountType, routingNumber, accountNumber, accountHolderName are required for bank",
        });
      }

      paymentTypeData = {
        accountType,
        routingNumber,
        token: accountNumber,
        accountHolderName,
        bankName: bankName || "",
      };

      console.log("DEBUG: Bank paymentTypeData to send:", paymentTypeData);
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid methodType" });
    }

    // Step 3: Create payment profile request
    const paymentProfile = new APIContracts.CustomerPaymentProfileType();
    const paymentType = new APIContracts.PaymentType();

    if (methodType === "card") {
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber(paymentTypeData.cardNumber);
      creditCard.setExpirationDate(paymentTypeData.expiry);
      if (paymentTypeData.cardCode)
        creditCard.setCardCode(paymentTypeData.cardCode);
      paymentType.setCreditCard(creditCard);
    } else {
      const bankAccount = new APIContracts.BankAccountType();
      bankAccount.setAccountType(paymentTypeData.accountType.toUpperCase());
      bankAccount.setRoutingNumber(paymentTypeData.routingNumber);
      bankAccount.setAccountNumber(paymentTypeData.token);
      bankAccount.setNameOnAccount(paymentTypeData.accountHolderName);
      if (paymentTypeData.bankName)
        bankAccount.setBankName(paymentTypeData.bankName);
      paymentType.setBankAccount(bankAccount);
    }

    paymentProfile.setPayment(paymentType);
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
    ); // sandbox

    console.log(
      "DEBUG: CreateCustomerPaymentProfile request JSON:",
      createPaymentProfileRequest.getJSON()
    );

    const paymentCtrl =
      new APIControllers.CreateCustomerPaymentProfileController(
        createPaymentProfileRequest.getJSON()
      );
    paymentCtrl.setEnvironment(authorizeConfig.getEndpoint());
    await new Promise((resolve) => paymentCtrl.execute(() => resolve()));
    const paymentProfileResponse = paymentCtrl.getResponse();

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
        message: "Failed to add payment method",
        authorizeNetResponse: paymentProfileResponse,
        error: errorMsg,
      });
    }

    const customerPaymentProfileId =
      paymentProfileResponse.customerPaymentProfileId;
    console.log("DEBUG: Added paymentProfileId:", customerPaymentProfileId);

    // Step 4: Store non-sensitive info in DB
    const paymentData = {
      methodType,
      paymentProfileId: customerPaymentProfileId,
      isDefault,
    };

    if (methodType === "card") {
      paymentData.last4 = cardNumber.slice(-4);
      paymentData.brand = "Unknown"; // optional: detect brand
      paymentData.expiry = expiry;
    } else {
      paymentData.accountType = accountType;
      paymentData.routingNumber = routingNumber;
      paymentData.accountHolderName = accountHolderName;
      paymentData.bankName = bankName || "";
    }

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
      error: err.message,
    });
  }
};

module.exports = { addPaymentMethod };

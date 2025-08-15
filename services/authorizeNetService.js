// services/authorizeNetService.js
const { APIContracts, APIControllers } = require("authorizenet");
const crypto = require("crypto");
const authorizeConfig = require("../config/authorize");

/**
 * Generate a merchantCustomerId <= 20 chars
 */
const createMerchantCustomerId = (userId) => {
  return crypto
    .createHash("md5")
    .update(userId.toString())
    .digest("hex")
    .substring(0, 20);
};

/**
 * Create a customer profile in Authorize.net
 * Returns { customerProfileId, merchantCustomerId }
 */
const createCustomerProfile = async (user) => {
  return new Promise((resolve, reject) => {
    const merchantCustomerId = createMerchantCustomerId(user._id);

    console.log(
      "DEBUG: merchantCustomerId:",
      merchantCustomerId,
      "length:",
      merchantCustomerId.length
    );

    const customerProfile = new APIContracts.CustomerProfileType();
    customerProfile.setMerchantCustomerId(merchantCustomerId);
    customerProfile.setEmail(user.email.substring(0, 255));
    customerProfile.setDescription(`Customer: ${user.name}`.substring(0, 255));

    const createRequest = new APIContracts.CreateCustomerProfileRequest();
    createRequest.setMerchantAuthentication(
      authorizeConfig.getMerchantAuthentication()
    );
    createRequest.setProfile(customerProfile);

    const controller = new APIControllers.CreateCustomerProfileController(
      createRequest.getJSON()
    );
    controller.setEnvironment(authorizeConfig.getEndpoint());

    controller.execute(() => {
      const apiResponse = controller.getResponse();
      console.log("DEBUG: createCustomerProfile API response:", apiResponse);

      if (!apiResponse) {
        return reject(new Error("No response from Authorize.net"));
      }

      const response = new APIContracts.CreateCustomerProfileResponse(
        apiResponse
      );

      if (
        response.getMessages().getResultCode() ===
        APIContracts.MessageTypeEnum.OK
      ) {
        resolve({
          customerProfileId: response.getCustomerProfileId(),
          merchantCustomerId,
        });
      } else {
        const errText =
          response.getMessages().getMessage()[0]?.getText() ||
          "Failed to create customer profile";
        const error = new Error(errText);
        error.response = apiResponse;
        reject(error);
      }
    });
  });
};

/**
 * Add a payment profile (card or bank) to an existing customer profile
 * cardOrBank: { methodType, token, last4?, brand?, expiry?, accountType?, routingNumber?, accountHolderName?, bankName? }
 */
const addPaymentProfile = async (customerProfileId, cardOrBank) => {
  return new Promise((resolve, reject) => {
    const paymentProfile = new APIContracts.CustomerPaymentProfileType();

    if (cardOrBank.methodType === "card") {
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber(cardOrBank.token);
      creditCard.setExpirationDate(cardOrBank.expiry);
      if (cardOrBank.cardCode) creditCard.setCardCode(cardOrBank.cardCode);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setCreditCard(creditCard);
      paymentProfile.setPayment(paymentType);
    } else if (cardOrBank.methodType === "bank") {
      const bankAccount = new APIContracts.BankAccountType();
      bankAccount.setAccountType(
        cardOrBank.accountType.toUpperCase() === "CHECKING"
          ? APIContracts.BankAccountTypeEnum.CHECKING
          : APIContracts.BankAccountTypeEnum.SAVINGS
      );
      bankAccount.setRoutingNumber(cardOrBank.routingNumber);
      bankAccount.setAccountNumber(cardOrBank.token);
      bankAccount.setNameOnAccount(cardOrBank.accountHolderName);
      if (cardOrBank.bankName) bankAccount.setBankName(cardOrBank.bankName);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setBankAccount(bankAccount);
      paymentProfile.setPayment(paymentType);
    } else {
      return reject(new Error("Unsupported payment method type"));
    }

    const request = new APIContracts.CreateCustomerPaymentProfileRequest();
    request.setMerchantAuthentication(
      authorizeConfig.getMerchantAuthentication()
    );
    request.setCustomerProfileId(customerProfileId);
    request.setPaymentProfile(paymentProfile);
    request.setValidationMode(APIContracts.ValidationModeEnum.TESTMODE); // sandbox

    const controller =
      new APIControllers.CreateCustomerPaymentProfileController(
        request.getJSON()
      );
    controller.setEnvironment(authorizeConfig.getEndpoint());

    controller.execute(() => {
      const apiResponse = controller.getResponse();
      console.log("DEBUG: addPaymentProfile API response:", apiResponse);

      if (!apiResponse)
        return reject(new Error("No response from Authorize.net"));

      const response = new APIContracts.CreateCustomerPaymentProfileResponse(
        apiResponse
      );

      if (
        response.getMessages().getResultCode() ===
        APIContracts.MessageTypeEnum.OK
      ) {
        resolve({ paymentProfileId: response.getCustomerPaymentProfileId() });
      } else {
        const errText =
          response.getMessages().getMessage()[0]?.getText() ||
          "Failed to add payment profile";
        reject(new Error(errText));
      }
    });
  });
};

/**
 * Charge a customer profile (card or bank)
 */
const chargeCustomerProfile = async (
  customerProfileId,
  paymentProfileId,
  amount
) => {
  return new Promise((resolve, reject) => {
    const profileToCharge = new APIContracts.CustomerProfilePaymentType();
    profileToCharge.setCustomerProfileId(customerProfileId);
    profileToCharge.setPaymentProfile(
      new APIContracts.PaymentProfile({ paymentProfileId })
    );

    const transactionRequest = new APIContracts.TransactionRequestType();
    transactionRequest.setTransactionType(
      APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
    );
    transactionRequest.setProfile(profileToCharge);
    transactionRequest.setAmount(parseFloat(amount.toFixed(2)));

    const createRequest = new APIContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(
      authorizeConfig.getMerchantAuthentication()
    );
    createRequest.setTransactionRequest(transactionRequest);

    const controller = new APIControllers.CreateTransactionController(
      createRequest.getJSON()
    );
    controller.setEnvironment(authorizeConfig.getEndpoint());

    controller.execute(() => {
      const apiResponse = controller.getResponse();
      console.log("DEBUG: chargeCustomerProfile API response:", apiResponse);

      if (!apiResponse)
        return reject(new Error("No response from Authorize.net"));

      const response = new APIContracts.CreateTransactionResponse(apiResponse);

      if (
        response.getMessages().getResultCode() ===
        APIContracts.MessageTypeEnum.OK
      ) {
        const txnResponse = response.getTransactionResponse();
        if (txnResponse && txnResponse.getMessages()) {
          resolve({
            success: true,
            transactionId: txnResponse.getTransId(),
            message: txnResponse.getMessages().getMessage()[0].getDescription(),
          });
        } else {
          const errText =
            txnResponse?.getErrors()?.getError()[0]?.getErrorText() ||
            "Transaction failed";
          reject(new Error(errText));
        }
      } else {
        const errText =
          response.getMessages().getMessage()[0]?.getText() ||
          "Transaction failed";
        reject(new Error(errText));
      }
    });
  });
};

module.exports = {
  createCustomerProfile,
  addPaymentProfile,
  chargeCustomerProfile,
};

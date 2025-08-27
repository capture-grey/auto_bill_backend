//a simple controller to check if connection with authorize.net is successful and bills are showing in dashboard
//transaction not tracked in database

const express = require("express");
const router = express.Router();
const authorizeConfig = require("../config/authorize");
const { APIContracts, APIControllers } = require("authorizenet");

// @route   POST /api/charge
// @desc    Process a manual card charge
router.post("/", async (req, res) => {
  let { amount, cardNumber, expirationDate, cardCode } = req.body;

  // Basic validation
  if (!amount || !cardNumber || !expirationDate) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields (amount, cardNumber, expirationDate)",
    });
  }

  try {
    // Clean inputs
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    cardNumber = cardNumber.replace(/\s+/g, "");

    // Create credit card object
    const creditCard = new APIContracts.CreditCardType();
    creditCard.setCardNumber(cardNumber);
    creditCard.setExpirationDate(expirationDate);
    if (cardCode) creditCard.setCardCode(cardCode);

    // Create payment type
    const paymentType = new APIContracts.PaymentType();
    paymentType.setCreditCard(creditCard);

    // Create transaction request
    const transactionRequestType = new APIContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(
      APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
    );
    transactionRequestType.setPayment(paymentType);
    transactionRequestType.setAmount(amount);

    // Build full request
    const createRequest = new APIContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(
      authorizeConfig.getMerchantAuthentication()
    );
    createRequest.setTransactionRequest(transactionRequestType);

    // Create and execute controller
    const controller = new APIControllers.CreateTransactionController(
      createRequest.getJSON()
    );
    controller.setEnvironment(authorizeConfig.getEndpoint());

    controller.execute(() => {
      const apiResponse = controller.getResponse();
      const response = new APIContracts.CreateTransactionResponse(apiResponse);

      if (response) {
        if (
          response.getMessages().getResultCode() ===
          APIContracts.MessageTypeEnum.OK
        ) {
          const transactionResponse = response.getTransactionResponse();
          if (transactionResponse && transactionResponse.getMessages()) {
            return res.json({
              success: true,
              transactionId: transactionResponse.getTransId(),
              responseCode: transactionResponse.getResponseCode(),
              message: transactionResponse
                .getMessages()
                .getMessage()[0]
                .getDescription(),
            });
          } else {
            return res.status(400).json({
              success: false,
              error: "Transaction failed",
              reason:
                transactionResponse
                  ?.getErrors()
                  ?.getError()[0]
                  ?.getErrorText() || "Unknown error",
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            error: "Transaction failed",
            reason: response.getMessages().getMessage()[0].getText(),
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          error: "No response from payment processor",
        });
      }
    });
  } catch (error) {
    console.error("Transaction processing error:", error);
    res.status(500).json({
      success: false,
      error: "Server error during transaction processing",
    });
  }
});

module.exports = router;

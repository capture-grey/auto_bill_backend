// controllers/ed_billing.controller.js
const User = require("../models/User");
const Usage = require("../models/Usage");
const Transaction = require("../models/Transaction");
const authorizeConfig = require("../config/authorize");
const { APIContracts, APIControllers } = require("authorizenet");
const crypto = require("crypto");

// Encryption config (should match your user model)
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(String(process.env.ENCRYPTION_KEY || "my_secret_key"))
  .digest("base64")
  .substr(0, 32);
const ALGORITHM = "aes-256-cbc";

const RATE_PER_MINUTE = 0.1;

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

/**
 * Process payment using decrypted payment data
 */
const processPaymentWithRawData = async (user, amount, note, paymentData) => {
  return new Promise((resolve, reject) => {
    const transactionRequest = new APIContracts.TransactionRequestType();
    transactionRequest.setTransactionType(
      APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
    );
    transactionRequest.setAmount(parseFloat(amount.toFixed(2)));

    // Set payment details based on decrypted data
    if (paymentData.methodType === "card") {
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber(paymentData.data.cardNumber.replace(/\s+/g, ""));
      creditCard.setExpirationDate(paymentData.data.expiry);
      creditCard.setCardCode(paymentData.data.cardCode);

      const paymentType = new APIContracts.PaymentType();
      paymentType.setCreditCard(creditCard);
      transactionRequest.setPayment(paymentType);
    } else if (paymentData.methodType === "bank") {
      const bankAccount = new APIContracts.BankAccountType();
      bankAccount.setAccountType(paymentData.data.accountType.toLowerCase());
      bankAccount.setRoutingNumber(paymentData.data.routingNumber);
      bankAccount.setAccountNumber(paymentData.data.accountNumber);
      bankAccount.setNameOnAccount(paymentData.data.accountHolderName);
      if (paymentData.data.bankName) {
        bankAccount.setBankName(paymentData.data.bankName);
      }

      const paymentType = new APIContracts.PaymentType();
      paymentType.setBankAccount(bankAccount);
      transactionRequest.setPayment(paymentType);
    }

    // Set order details
    const order = new APIContracts.OrderType();
    order.setDescription(note || "Encrypted data billing");
    transactionRequest.setOrder(order);

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
      const response = new APIContracts.CreateTransactionResponse(apiResponse);

      if (!response) {
        return reject(new Error("No response from payment processor"));
      }

      if (
        response.getMessages().getResultCode() ===
        APIContracts.MessageTypeEnum.OK
      ) {
        const transactionResponse = response.getTransactionResponse();
        if (transactionResponse && transactionResponse.getMessages()) {
          return resolve({
            success: true,
            transactionId: transactionResponse.getTransId(),
            authCode: transactionResponse.getAuthCode(),
            responseCode: transactionResponse.getResponseCode(),
            amount,
            message: transactionResponse
              .getMessages()
              .getMessage()[0]
              .getDescription(),
            methodType: paymentData.methodType,
          });
        } else {
          return reject(
            new Error(
              transactionResponse?.getErrors()?.getError()[0]?.getErrorText() ||
                "Transaction failed"
            )
          );
        }
      } else {
        return reject(
          new Error(response.getMessages().getMessage()[0].getText())
        );
      }
    });
  });
};

/**
 * Charge users using encrypted payment data
 */
const edChargeUsersByIds = async (req, res) => {
  try {
    const { userIds, note } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "userIds array is required",
      });
    }

    const results = await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          const user = await User.findById(userId);
          if (!user) {
            return {
              user: userId,
              status: "failed",
              message: "User not found",
            };
          }

          // Get default encrypted payment method
          const defaultEncryptedMethod = user.edPaymentMethods.find(
            (method) => method.isDefault
          );
          if (!defaultEncryptedMethod) {
            return {
              user: user.email,
              status: "failed",
              message: "No default encrypted payment method found",
            };
          }

          // Decrypt payment data
          const decryptedData = decryptData(
            defaultEncryptedMethod.encryptedData,
            defaultEncryptedMethod.iv
          );
          const paymentData = JSON.parse(decryptedData);

          // Get unpaid usage
          const unpaidUsages = await Usage.find({
            user: userId,
            isPaid: false,
          });

          const totalMinutes = unpaidUsages.reduce(
            (sum, u) => sum + (u.durationMinutes || 0),
            0
          );

          if (totalMinutes <= 0) {
            return {
              user: user.email,
              status: "skipped",
              message: "No unpaid usage",
            };
          }

          const amount = totalMinutes * RATE_PER_MINUTE;

          // Process payment with decrypted data
          const paymentResult = await processPaymentWithRawData(
            user,
            amount,
            note,
            paymentData
          );

          // Save transaction
          const transaction = new Transaction({
            user: user._id,
            usageItems: unpaidUsages.map((u) => u._id),
            amount,
            methodType: paymentResult.methodType,
            transactionId: paymentResult.transactionId,
            authCode: paymentResult.authCode || null,
            responseCode: paymentResult.responseCode || null,
            responseMessage: paymentResult.message || null,
            status: paymentResult.success ? "success" : "failed",
            failureReason: paymentResult.success ? null : paymentResult.message,
            note: note || "Encrypted data billing charge",
            isEncryptedData: true,
          });
          await transaction.save();

          // Mark usages as paid
          await Usage.updateMany(
            { _id: { $in: unpaidUsages.map((u) => u._id) } },
            {
              isPaid: true,
              paymentReference: paymentResult.transactionId,
              lastPaidAt: new Date(),
              methodType: paymentResult.methodType,
            }
          );

          return {
            user: user.email,
            amount: paymentResult.amount,
            paidUsages: unpaidUsages.length,
            paymentMethod: paymentResult.methodType,
            status: "success",
            transactionId: transaction._id,
            message: paymentResult.message,
            isEncryptedData: true,
          };
        } catch (err) {
          console.error(`Error processing user ${userId}:`, err);
          return {
            user: userId,
            status: "failed",
            message: err.message || "Error processing payment",
          };
        }
      })
    );

    const summary = {
      total: results.length,
      success: results.filter(
        (r) => r.status === "fulfilled" && r.value?.status === "success"
      ).length,
      failed: results.filter(
        (r) => r.status === "fulfilled" && r.value?.status === "failed"
      ).length,
      skipped: results.filter(
        (r) => r.status === "fulfilled" && r.value?.status === "skipped"
      ).length,
      errors: results.filter((r) => r.status === "rejected").length,
    };

    res.status(200).json({
      success: true,
      summary,
      results: results.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : {
              status: "error",
              message: r.reason?.message || "Unknown error",
            }
      ),
    });
  } catch (err) {
    console.error("ED Charge users error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

module.exports = { edChargeUsersByIds };

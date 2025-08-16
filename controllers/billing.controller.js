// controllers/billing.controller.js
const User = require("../models/User");
const Usage = require("../models/Usage");
const Transaction = require("../models/Transaction");
const authorizeConfig = require("../config/authorize");
const { APIContracts, APIControllers } = require("authorizenet");

const RATE_PER_MINUTE = 0.1;

/**
 * Process payment using Authorize.net Customer Profile
 */
const processPayment = (user, amount, note) => {
  const defaultPayment = user.paymentMethods.find((pm) => pm.isDefault);
  if (!defaultPayment)
    return Promise.reject(new Error("No default payment method found"));
  if (!user.customerProfileId || !defaultPayment.paymentProfileId)
    return Promise.reject(new Error("Customer or payment profile ID missing"));

  return new Promise((resolve, reject) => {
    const transactionRequest = new APIContracts.TransactionRequestType();
    transactionRequest.setTransactionType(
      APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
    );
    transactionRequest.setAmount(parseFloat(amount.toFixed(2)));

    const profileToCharge = new APIContracts.CustomerProfilePaymentType();
    profileToCharge.setCustomerProfileId(user.customerProfileId);
    const paymentProfile = new APIContracts.PaymentProfile();
    paymentProfile.setPaymentProfileId(defaultPayment.paymentProfileId);
    profileToCharge.setPaymentProfile(paymentProfile);

    transactionRequest.setProfile(profileToCharge);

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

      if (!response)
        return reject(new Error("No response from payment processor"));

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
            methodType: defaultPayment.methodType,
            customerProfileId: user.customerProfileId,
            paymentProfileId: defaultPayment.paymentProfileId,
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
 * Charge selected users
 */
const chargeSelectedUsers = async (req, res) => {
  const { userIds, note } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "userIds array is required" });
  }
  await chargeUsersByIds(userIds, note, res);
};

/**
 * Charge all users
 */
const chargeAllUsers = async (req, res) => {
  const users = await User.find();
  const userIds = users.map((u) => u._id.toString());
  await chargeUsersByIds(userIds, "Automatic billing for active services", res);
};

/**
 * Helper: charge array of userIds
 */
const chargeUsersByIds = async (userIds, note, res) => {
  try {
    const results = await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          const user = await User.findById(userId);
          if (!user)
            return {
              user: userId,
              status: "failed",
              message: "User not found",
            };

          const unpaidUsages = await Usage.find({
            user: userId,
            isPaid: false,
          });

          const totalMinutes = unpaidUsages.reduce(
            (sum, u) => sum + (u.durationMinutes || 0),
            0
          );

          if (totalMinutes <= 0)
            return {
              user: user.email,
              status: "skipped",
              message: "No unpaid usage",
            };

          const amount = totalMinutes * RATE_PER_MINUTE;

          // 🔑 Call payment processor
          const paymentResult = await processPayment(user, amount, note);

          // ✅ Save transaction to DB
          const transaction = new Transaction({
            user: user._id,
            usageItems: unpaidUsages.map((u) => u._id),
            amount,
            methodType: paymentResult.methodType,
            customerProfileId: paymentResult.customerProfileId,
            paymentProfileId: paymentResult.paymentProfileId,
            transactionId: paymentResult.transactionId,
            authCode: paymentResult.authCode || null,
            responseCode: paymentResult.responseCode || null,
            responseMessage: paymentResult.message || null,
            status: paymentResult.success ? "success" : "failed",
            failureReason: paymentResult.success ? null : paymentResult.message,
            note: note || "Manual charge",
          });
          await transaction.save();

          // ✅ Mark usages as paid
          await Usage.updateMany(
            { _id: { $in: unpaidUsages.map((u) => u._id) } },
            {
              isPaid: true,
              paymentReference: paymentResult.transactionId,
              lastPaidAt: new Date(),
              methodType: paymentResult.methodType,
              customerProfileId: paymentResult.customerProfileId,
              paymentProfileId: paymentResult.paymentProfileId,
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
          };
        } catch (err) {
          console.error(`Error processing user ${userId}:`, err);
          return {
            user: userId,
            status: "failed",
            message: err.message || "Error",
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
        (r) => r.status === "fulfilled" && r.value?.status !== "success"
      ).length,
      errors: results.filter((r) => r.status === "rejected").length,
    };

    res.status(200).json({
      success: true,
      summary,
      results: results.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : { status: "error", message: r.reason?.message }
      ),
    });
  } catch (err) {
    console.error("Charge users error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = { chargeSelectedUsers, chargeAllUsers };

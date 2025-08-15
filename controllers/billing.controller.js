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
  if (
    !user.authorizeNetCustomerProfileId ||
    !defaultPayment.authorizeNetPaymentProfileId
  )
    return Promise.reject(new Error("Customer or payment profile ID missing"));

  return new Promise((resolve, reject) => {
    const transactionRequest = new APIContracts.TransactionRequestType();
    transactionRequest.setTransactionType(
      APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
    );
    transactionRequest.setAmount(parseFloat(amount.toFixed(2)));

    const profileToCharge = new APIContracts.CustomerProfilePaymentType();
    profileToCharge.setCustomerProfileId(user.authorizeNetCustomerProfileId);
    profileToCharge.setPaymentProfile(new APIContracts.PaymentProfile());
    profileToCharge
      .getPaymentProfile()
      .setPaymentProfileId(defaultPayment.authorizeNetPaymentProfileId);

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
            amount,
            message: transactionResponse
              .getMessages()
              .getMessage()[0]
              .getDescription(),
            methodType: defaultPayment.methodType,
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
 * Charge multiple users based on unpaid usage
 */
const chargeSelectedUsers = async (req, res) => {
  try {
    const { userIds, note } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "userIds array is required" });
    }

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
          const paymentResult = await processPayment(user, amount, note);

          // Save transaction
          const transaction = new Transaction({
            user: user._id,
            usageItems: unpaidUsages.map((u) => u._id),
            amount,
            methodType: paymentResult.methodType,
            transactionId: paymentResult.transactionId,
            status: "success",
            note: note || "Manual charge",
          });
          await transaction.save();

          // Mark usages as paid
          await Usage.updateMany(
            { _id: { $in: unpaidUsages.map((u) => u._id) } },
            { isPaid: true, paymentReference: paymentResult.transactionId }
          );

          return {
            user: user.email,
            amount: paymentResult.amount,
            paidUsages: unpaidUsages.length,
            paymentMethod: paymentResult.methodType,
            status: "success",
            transactionId: paymentResult.transactionId,
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
    console.error("Charge selected users error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = { chargeSelectedUsers };

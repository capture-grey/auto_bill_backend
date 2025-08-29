// services/cronBillingService.js
const cron = require("node-cron");
const User = require("../models/User");
const Usage = require("../models/Usage");
const Transaction = require("../models/Transaction");
const authorizeConfig = require("../config/authorize");
const { APIContracts, APIControllers } = require("authorizenet");

const RATE_PER_MINUTE = 0.1;

/*
 * Process payment (standalone version without Express res object)
 */
const processPaymentStandalone = (user, amount, note) => {
  const defaultPayment = user.paymentMethods.find((pm) => pm.isDefault);
  if (!defaultPayment) throw new Error("No default payment method found");
  if (!user.customerProfileId || !defaultPayment.paymentProfileId)
    throw new Error("Customer or payment profile ID missing");

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
 * Charge users without Express response object
 */
const chargeUsersCron = async (userIds, note) => {
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

        // Call payment processor
        const paymentResult = await processPaymentStandalone(
          user,
          amount,
          note
        );

        // Save transaction to DB
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
          note: note || "Automatic monthly charge",
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
      (r) => r.status === "fulfilled" && r.value?.status === "failed"
    ).length,
    skipped: results.filter(
      (r) => r.status === "fulfilled" && r.value?.status === "skipped"
    ).length,
    errors: results.filter((r) => r.status === "rejected").length,
  };

  return {
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
  };
};

/*
 * Monthly billing cron job
 */
const startMonthlyBillingCron = () => {
  // Run at 2:00 AM on the 1st day of every month
  cron.schedule(
    "0 2 1 * *",
    async () => {
      try {
        console.log(
          "Starting automated monthly billing...",
          new Date().toISOString()
        );

        const users = await User.find();
        const userIds = users.map((u) => u._id.toString());

        const result = await chargeUsersCron(
          userIds,
          "Monthly automatic billing"
        );

        console.log("Monthly billing completed:", {
          success: result.success,
          summary: result.summary,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(" Monthly billing cron job error:", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    }
  );

  console.log(
    "Monthly billing cron job scheduled (2:00 AM on 1st of every month)"
  );
};

/*
 * runs every 10 minutes in development
 */
const startTestBillingCron = () => {
  if (process.env.NODE_ENV === "development") {
    cron.schedule("*/10 * * * *", async () => {
      console.log("Test billing job running...", new Date().toISOString());
    });
  }
};

module.exports = {
  startMonthlyBillingCron,
  startTestBillingCron,
};

// external imports
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("path");
const cookieParser = require("cookie-parser");

//internal imports
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");
const connectDB = require("./config/db.js");

const authRouter = require("./routes/auth.routes");
const usageRoutes = require("./routes/usage.routes");
const billingRoutes = require("./routes/billing.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const paymentRoutes = require("./routes/payment.routes");

const edPaymentRoutes = require("./routes/ed_payment.routes");
const edBillingRoutes = require("./routes/ed_billing.routes");

const chargeRouter = require("./ref/charge");

const app = express();
dotenv.config();

// database connection
connectDB();

// request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// set static folder
app.use(express.static(path.join(__dirname, "public")));

// parse cookies
app.use(cookieParser(process.env.COOKIE_SECRET));

app.get("/", (req, res) => {
  res.status(200).json({ message: "Hello From Octobill" });
});

app.use("/api/auth", authRouter);
app.use("/api/usage", usageRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/payment", paymentRoutes);

app.use("/api/payment/ed", edPaymentRoutes);
app.use("/api/ed", edBillingRoutes);

app.use("/api/charge", chargeRouter);

// 404 not found handler
app.use(notFoundHandler);

// common error handler
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`app listening to port ${process.env.PORT}`);
});

//module.exports = app;

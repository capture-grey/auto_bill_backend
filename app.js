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
} = require("./middlewares/common/errorHandler");

const authRouter = require("./router/authRouter");
const userRouter = require("./router/userRouter");
const bookRouter = require("./router/bookRouter");
const forumRouter = require("./router/forumRouter");

const app = express();
dotenv.config();

// database connection
mongoose
  .connect(process.env.MONGO_CONNECTION_STRING)
  .then(() => console.log("database connection successful!"))
  .catch((err) => console.log(err));

// request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// set static folder
app.use(express.static(path.join(__dirname, "public")));

// parse cookies
app.use(cookieParser(process.env.COOKIE_SECRET));

// routing setup
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/book", bookRouter);
app.use("/api/forum", forumRouter);

app.get("/", (req, res) => {
  res.status(200).json({ message: "Hello From Bookies!" });
});

// 404 not found handler
app.use(notFoundHandler);

// common error handler
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`app listening to port ${process.env.PORT}`);
});

//module.exports = app;

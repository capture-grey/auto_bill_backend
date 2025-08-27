//database connection
const mongoose = require("mongoose");

const connectDB = async () => {
  mongoose
    .connect(process.env.MONGO_CONNECTION_STRING)
    .then(() => console.log("database connection successful!"))
    .catch((err) => console.log(err));
};

module.exports = connectDB;

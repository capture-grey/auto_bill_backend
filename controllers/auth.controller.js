const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

/**
 * Register a new user
 * First user will be admin, others default to user role
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role, timezone, paymentMethods } = req.body; // Changed to paymentMethods

    if (!name || !email || !password || !timezone || !paymentMethods) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Check if email exists
    const existing = await User.findOne({ email });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });

    // Determine role: first user = admin, else user
    let assignedRole = role;
    const userCount = await User.countDocuments();
    if (userCount === 0) assignedRole = "admin";
    else assignedRole = "user";

    // Validate at least one default payment method
    const hasDefault = paymentMethods.some((method) => method.isDefault);
    if (!hasDefault) {
      return res.status(400).json({
        success: false,
        message: "At least one payment method must be set as default",
      });
    }

    const user = new User({
      name,
      email,
      password,
      role: assignedRole,
      timezone,
      paymentMethods, // Changed to paymentMethods
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        timezone,
        paymentMethods: user.paymentMethods, // Include in response
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Login user
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        timezone: user.timezone,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { register, login };

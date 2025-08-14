// const mongoose = require("mongoose");
// const JWT = require("jsonwebtoken");
// const bcrypt = require("bcrypt");
// //const { v4: uuidv4 } = require("uuid");
// const dotenv = require("dotenv");

// const User = require("../models/user");
// const Book = require("../models/book");
// const Forum = require("../models/forum");

// const getOwnInfo = async (req, res, next) => {
//   try {
//     console.log("here");
//     const userId = req.user._id;

//     //  user with forum data populated
//     const user = await User.findById(userId)
//       .select("name joinedForums")
//       .populate({
//         path: "joinedForums.forumId",
//         select: "name location members hiddenBooks",
//         populate: {
//           path: "members.userId",
//           select: "ownedBooks",
//         },
//       });

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     //  forums
//     const forums = user.joinedForums.map((forum) => {
//       const forumData = forum.forumId;

//       // combine all books from all members
//       const allMemberBooks = forumData.members.flatMap(
//         (m) => m.userId?.ownedBooks || []
//       );

//       // remove hidden books from count
//       const visibleBooks = allMemberBooks.filter(
//         (bookId) =>
//           !forumData.hiddenBooks.some(
//             (hiddenId) => hiddenId.toString() === bookId.toString()
//           )
//       );

//       return {
//         forumId: forumData._id,
//         name: forumData.name,
//         location: forumData.location,
//         memberCount: forumData.members.length,
//         membersBookCount: visibleBooks.length,
//         role: forum.role,
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       user: {
//         id: user._id,
//         name: user.name,
//         forums,
//       },
//     });
//   } catch (error) {
//     console.error("Get own info error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };
// const editOwnInfo = async (req, res, next) => {
//   const session = await mongoose.startSession();
//   try {
//     await session.startTransaction();
//     const userId = req.user._id;
//     const { name, email, currentPassword, newPassword } = req.body;

//     // any field provided
//     if (!name && !email && !newPassword) {
//       await session.abortTransaction();
//       return res.status(400).json({
//         success: false,
//         message: "At least one field must be provided",
//       });
//     }

//     // get user
//     const user = await User.findById(userId)
//       .select("+password")
//       .session(session);
//     if (!user) {
//       await session.abortTransaction();
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // update name
//     if (name) {
//       if (typeof name !== "string" || !name.trim()) {
//         await session.abortTransaction();
//         return res.status(400).json({
//           success: false,
//           message: "Invalid name format",
//         });
//       }
//       user.name = name.trim();
//     }

//     // update email
//     if (email) {
//       const trimmedEmail = email.trim().toLowerCase();
//       if (!trimmedEmail) {
//         await session.abortTransaction();
//         return res.status(400).json({
//           success: false,
//           message: "Invalid email format",
//         });
//       }

//       const emailExists = await User.findOne({
//         email: trimmedEmail,
//         _id: { $ne: userId },
//       }).session(session);

//       if (emailExists) {
//         await session.abortTransaction();
//         return res.status(409).json({
//           success: false,
//           message: "Email already in use",
//         });
//       }
//       user.email = trimmedEmail;
//     }

//     // update password
//     if (newPassword) {
//       if (!currentPassword) {
//         await session.abortTransaction();
//         return res.status(400).json({
//           success: false,
//           message: "Current password is required",
//         });
//       }

//       // check current password
//       const isMatch = await user.comparePassword(currentPassword);
//       if (!isMatch) {
//         await session.abortTransaction();
//         return res.status(401).json({
//           success: false,
//           message: "Current password is incorrect",
//         });
//       }

//       if (newPassword.length < 6) {
//         await session.abortTransaction();
//         return res.status(400).json({
//           success: false,
//           message: "Password must be at least 6 characters",
//         });
//       }

//       user.password = newPassword;
//     }

//     await user.save({ session });
//     await session.commitTransaction();

//     // Include email in the response
//     const responseData = {
//       name: user.name,
//       email: user.email, // This will include the email whether it was updated or not
//     };

//     return res.status(200).json({
//       success: true,
//       message: "Profile updated successfully",
//       data: responseData,
//     });
//   } catch (error) {
//     if (session.inTransaction()) await session.abortTransaction();

//     if (error.name === "ValidationError") {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         errors: error.errors,
//       });
//     }

//     console.error("Edit profile error:", error);
//     next(error);
//   } finally {
//     await session.endSession();
//   }
// };
// const getOwnBooks = async (req, res, next) => {
//   try {
//     const user = await User.findById(req.user._id)
//       .select("ownedBooks")
//       .populate({
//         path: "ownedBooks",
//         select: "title author genre",
//         options: { sort: { title: 1 } },
//       });

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     const books = user.ownedBooks
//       .filter((book) => book !== null)
//       .map((book) => ({
//         id: book._id,
//         title: book.title,
//         author: book.author,
//         genre: book.genre,
//       }));

//     return res.status(200).json({
//       success: true,
//       count: books.length,
//       books,
//     });
//   } catch (error) {
//     console.error("Get user books error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };
// const deleteAccount = async (req, res, next) => {
//   const session = await mongoose.startSession();
//   try {
//     await session.startTransaction();
//     const userId = req.user._id;

//     // get user with forum reference
//     const user = await User.findById(userId)
//       .select("joinedForums")
//       .session(session);

//     if (!user) {
//       await session.abortTransaction();
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // admin transfer
//     const adminForums = await Forum.find({
//       "members.userId": userId,
//       "members.role": "admin",
//     }).session(session);

//     for (const forum of adminForums) {
//       if (forum.members.length > 1) {
//         const otherMembers = await Forum.aggregate([
//           { $match: { _id: forum._id } },
//           { $unwind: "$members" },
//           { $match: { "members.userId": { $ne: userId } } },
//           { $sample: { size: 1 } },
//         ]).session(session);

//         if (otherMembers.length > 0) {
//           const newAdminId = otherMembers[0].members.userId;

//           await Forum.updateOne(
//             { _id: forum._id, "members.userId": newAdminId },
//             { $set: { "members.$.role": "admin" } },
//             { session }
//           );

//           await User.updateOne(
//             { _id: newAdminId, "joinedForums.forumId": forum._id },
//             { $set: { "joinedForums.$.role": "admin" } },
//             { session }
//           );
//         }
//       }
//     }

//     // remove user from all forums
//     await Forum.updateMany(
//       { "members.userId": userId },
//       { $pull: { members: { userId } } },
//       { session }
//     );

//     // delete user
//     await User.deleteOne({ _id: userId }).session(session);

//     await session.commitTransaction();

//     // clearn token
//     res.clearCookie("token");

//     return res.status(200).json({
//       success: true,
//       message: "Account deleted successfully",
//       data: {
//         forumsUpdated: adminForums.length,
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error("Delete account error:", error);

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid user ID",
//       });
//     }

//     next(error);
//   } finally {
//     await session.endSession();
//   }
// };

// module.exports = {
//   getOwnInfo,
//   getOwnBooks,
//   deleteAccount,
//   editOwnInfo,
// };

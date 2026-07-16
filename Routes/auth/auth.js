const express = require("express");
const authController = require("../../Controllers/AuthController/authController");
const { authMiddleware, authAndRole } = require("../../middlewares/auth");
const { upload } = require("../../config/multerConfig");
const { ensureVerificationRecord } = require("../../middlewares/eligibilityMiddleware");

const router = express.Router();

router.post("/setup-admin", authController.setupAdmin);
router.post("/register", authController.register);
router.post("/login",ensureVerificationRecord, authController.login);

// ==================== REFRESH TOKEN ====================

/**
 * @route POST /api/auth/refresh-token
 * @desc Refresh access token
 * @access Public
 */
router.post("/refresh-token", authController.refreshToken);

// ==================== LOGOUT ====================

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Private
 */
router.post("/logout", authAndRole('admin'), authController.logout);

// ==================== FORGOT PASSWORD ====================

/**
 * @route POST /api/auth/forgot-password
 * @desc Send password reset email
 * @access Public
 */
router.post("/forgot-password", authController.forgotPassword);

// ==================== RESET PASSWORD ====================

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post("/reset-password", authController.resetPassword);

// ==================== CHANGE PASSWORD ====================

/**
 * @route POST /api/auth/change-password
 * @desc Change password (authenticated)
 * @access Private
 */
router.post("/change-password", authMiddleware, authController.changePassword);

// ==================== VERIFY EMAIL ====================

/**
 * @route POST /api/auth/verify-email
 * @desc Verify email with OTP
 * @access Public
 */
router.post("/verify-email", authController.verifyEmail);

// ==================== RESEND VERIFICATION ====================

/**
 * @route POST /api/auth/resend-verification
 * @desc Resend verification email
 * @access Public
 */
router.post("/resend-verification", authController.resendVerification);

// ==================== GET CURRENT USER ====================

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get("/me", authMiddleware, authController.getCurrentUser);

// ==================== UPDATE PROFILE ====================

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put("/profile", authMiddleware, upload.single('profileImage'), authController.updateProfile);

// ==================== GET ALL USERS (Admin) ====================

/**
 * @route GET /api/auth/users
 * @desc Get all users (Admin only)
 * @access Private/Admin
 */
router.get("/users", authAndRole('admin'), authController.getAllUsers);

// ==================== UPDATE USER (Admin) ====================

/**
 * @route PUT /api/auth/users/:id
 * @desc Update user (Admin only)
 * @access Private/Admin
 */
router.put("/users/:id", authAndRole('admin'), authController.updateUser);

// ==================== DELETE USER (Admin) ====================

/**
 * @route DELETE /api/auth/users/:id
 * @desc Delete user (Admin only)
 * @access Private/Admin
 */
router.delete("/users/:id", authAndRole('admin'), authController.deleteUser);

module.exports = router;

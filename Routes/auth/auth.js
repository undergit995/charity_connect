const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../../models/User");
const Charity = require("../../models/CharityModel");
// const Campaign = require("../models/Campaign");
// const Donation = require("../models/Donation");
// const ActivityLog = require("../models/ActivityLog");
const authMiddleware = require("../../middlewares/auth");
const otpService = require("../../utils/otpService");
const {
  validateEmail,
  validatePhone,
  validatePassword,
} = require("../../utils/validators");
const { sendEmail } = require("../../utils/emailService");
const {
  validatePasswordDetailed,
} = require("../../../Frontend/src/Utils/validators");
const ActivityLog = require("../../models/ActivityLog");
const generateTokens = require("../../utils/refreshToken");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "CharityConnectSecretKey";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "CharityConnectRefreshSecretKey";

const logActivity = async (userId, action, details = {}) => {
  try {
    const activity = new ActivityLog({
      userId,
      action,
      details,
      timestamp: new Date(),
    });
    await activity.save();
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

const sendWelcomeEmail = async (email, name, role) => {
  try {
    const emailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .welcome { font-size: 20px; font-weight: 600; color: #1a1a2e; margin: 20px 0; }
            .message { color: #4a4a6a; line-height: 1.6; }
            .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">❤️ CharityConnect</div>
            </div>
            <h2 class="welcome">Welcome ${name}! 🎉</h2>
            <p class="message">Thank you for joining CharityConnect as a <strong>${role}</strong>.</p>
            <p class="message">You're now part of a community dedicated to making a difference through charitable giving.</p>
            <p class="message">Here's what you can do next:</p>
            <ul>
              <li>Complete your profile</li>
              <li>Explore campaigns</li>
              <li>Start your giving journey</li>
            </ul>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard" class="button">Go to Dashboard</a>
            </div>
            <p class="message">If you have any questions, feel free to contact our support team.</p>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendEmail({
      to: email,
      subject: "Welcome to CharityConnect 🎉",
      html: emailContent,
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
  }
};

router.post("/setup-admin", async (req, res) => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin already exists",
      });
    }

    // Create default admin
    const hashedPassword = await bcrypt.hash("CharityConnect@2024", 10);

    const adminUser = new User({
      firstName: "System",
      lastName: "Admin",
      fullName: "System Admin",
      email: "admin@charityconnect.com",
      password: hashedPassword,
      phone: "+1234567890",
      role: "admin",
      isApproved: true,
      isActive: true,
      emailVerified: true,
      permissions: ["*"],
    });

    await adminUser.save();

    await logActivity(adminUser._id, "Admin account created", {
      type: "initial_setup",
    });

    res.status(201).json({
      success: true,
      message: "Default admin created successfully",
      data: {
        user: {
          id: adminUser._id,
          email: adminUser.email,
          role: adminUser.role,
        },
        credentials: {
          email: "admin@charityconnect.com",
          password: "CharityConnect@2024",
        },
      },
    });
  } catch (error) {
    console.error("Setup admin error:", error);
    res.status(500).json({
      success: false,
      message: "Error setting up admin",
      error: error.message,
    });
  }
});

router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      phone,
      role,
      acceptTerms,
      organizationName,
      organizationType,
      registrationNumber,
      address,
      city,
      state,
      country,
      zipCode,
      website,
      description,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !phone || !role) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Validate password
    const passwordValidation = validatePasswordDetailed(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors[0],
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({
          success: false,
          message: "User with this phone number already exists",
        });
      }
    }

    // Validate role
    const validRoles = ["donor", "charity", "admin"];
    const normalizedRole = role.toLowerCase();
    if (!validRoles.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be donor or charity",
      });
    }

    if (normalizedRole === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts can only be created by existing admins",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userData = {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      password: hashedPassword,
      role: normalizedRole,
      isApproved: normalizedRole === "donor" ? true : false,
      isActive: true,
      emailVerified: false,
      acceptTerms: acceptTerms === "true" || acceptTerms === true,
      address: address || "",
      city: city || "",
      state: state || "",
      country: country || "India",
      zipCode: zipCode || "",
      website: website || "",
      description: description || "",
      //   profileImage: req.file ? req.file.path : null,
      permissions:
        normalizedRole === "donor"
          ? [
              "view_campaigns",
              "make_donations",
              "view_donations",
              "save_campaigns",
            ]
          : [
              "view_campaigns",
              "create_campaigns",
              "edit_campaigns",
              "view_donations",
              "post_updates",
            ],
    };

    // Add organization details for charity role
    // Add organization details for charity role
    if (normalizedRole === "charity") {
      // Extract charityDetails from req.body (or adapt based on your destructuring)
      const { charityDetails } = req.body;

      if (!charityDetails || !charityDetails.organizationName) {
        return res.status(400).json({
          success: false,
          message: "Organization name is required for charity registration",
        });
      }

      const charityData = {
        organizationName: charityDetails.organizationName,
        organizationType: charityDetails.organizationType || "Non-Profit",
        registrationNumber: charityDetails.registrationNumber || "",
        verified: false,
      };

      userData.charityDetails = charityData;
    }

    const user = new User(userData);
    await user.save();

    // Log activity
    await logActivity(user._id, "User registered", {
      role: normalizedRole,
      email: user.email,
    });

    // Send welcome email
    await sendWelcomeEmail(email, user.fullName, normalizedRole);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Return response without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: `${normalizedRole} registered successfully`,
      data: {
        user: userResponse,
        accessToken,
        refreshToken,
        requiresVerification: true,
        requiresApproval: normalizedRole === "charity",
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Check if user is approved (for charities)
    if (user.role === "charity" && !user.isApproved) {
      return res.status(403).json({
        success: false,
        message:
          "Your charity account is pending approval. You'll be notified once approved.",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log activity
    await logActivity(user._id, "User logged in", {
      rememberMe,
    });

    // Return response without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: userResponse,
        accessToken,
        refreshToken,
        isAuthenticated: true,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
      error: error.message,
    });
  }
});

// ==================== REFRESH TOKEN ====================

/**
 * @route POST /api/auth/refresh-token
 * @desc Refresh access token
 * @access Public
 */
router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    // Find user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Implement Refresh Token Rotation: generate a new access AND refresh token
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    res.status(200).json({
      success: true,
      data: {
        accessToken: accessToken,
        refreshToken: newRefreshToken, // Send the new refresh token to the client
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      message: "Error refreshing token",
      error: error.message,
    });
  }
});

// ==================== LOGOUT ====================

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Private
 */
// router.post("/logout", authMiddleware, async (req, res) => {
//   try {
//     // Log activity
//     await logActivity(req.userId, "User logged out");

//     res.status(200).json({
//       success: true,
//       message: "Logout successful",
//     });
//   } catch (error) {
//     console.error("Logout error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error during logout",
//       error: error.message,
//     });
//   }
// });

// ==================== FORGOT PASSWORD ====================

/**
 * @route POST /api/auth/forgot-password
 * @desc Send password reset email
 * @access Public
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists for security
      return res.status(200).json({
        success: true,
        message:
          "If an account exists with this email, you will receive a password reset link.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Save token to user
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/reset-password?token=${resetToken}`;

    const emailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">❤️ CharityConnect</div>
            </div>
            <h2>Reset Your Password</h2>
            <p>You requested to reset your password. Click the button below to set a new password.</p>
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>
            <p>This link will expire in <strong>1 hour</strong>.</p>
            <p>If you didn't request this, please ignore this email or contact support.</p>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendEmail({
      to: email,
      subject: "Password Reset - CharityConnect",
      html: emailContent,
    });

    res.status(200).json({
      success: true,
      message:
        "If an account exists with this email, you will receive a password reset link.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing request",
      error: error.message,
    });
  }
});

// ==================== RESET PASSWORD ====================

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordDetailed(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors[0],
      });
    }

    // Hash token
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token. Please request a new one.",
      });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Log activity
    await logActivity(user._id, "Password reset");

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
      error: error.message,
    });
  }
});

// ==================== CHANGE PASSWORD ====================

/**
 * @route POST /api/auth/change-password
 * @desc Change password (authenticated)
 * @access Private
 */
// router.post("/change-password", authMiddleware, async (req, res) => {
//   try {
//     const { currentPassword, newPassword, confirmPassword } = req.body;

//     if (!currentPassword || !newPassword) {
//       return res.status(400).json({
//         success: false,
//         message: "Current password and new password are required",
//       });
//     }

//     if (newPassword !== confirmPassword) {
//       return res.status(400).json({
//         success: false,
//         message: "Passwords do not match",
//       });
//     }

//     // Validate password strength
//     const passwordValidation = validatePasswordDetailed(newPassword);
//     if (!passwordValidation.isValid) {
//       return res.status(400).json({
//         success: false,
//         message: passwordValidation.errors[0],
//       });
//     }

//     // Find user
//     const user = await User.findById(req.userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Verify current password
//     const isValidPassword = await bcrypt.compare(currentPassword, user.password);
//     if (!isValidPassword) {
//       return res.status(401).json({
//         success: false,
//         message: "Current password is incorrect",
//       });
//     }

//     // Update password
//     const hashedPassword = await bcrypt.hash(newPassword, 10);
//     user.password = hashedPassword;
//     await user.save();

//     // Log activity
//     await logActivity(user._id, "Password changed");

//     res.status(200).json({
//       success: true,
//       message: "Password changed successfully",
//     });
//   } catch (error) {
//     console.error("Change password error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error changing password",
//       error: error.message,
//     });
//   }
// });

// ==================== VERIFY EMAIL ====================

/**
 * @route POST /api/auth/verify-email
 * @desc Verify email with OTP
 * @access Public
 */
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Verify OTP
    const result = otpService.verifyOTP(email, otp, "verification");

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    // Find and update user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.emailVerified = true;
    await user.save();

    // Log activity
    await logActivity(user._id, "Email verified");

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying email",
      error: error.message,
    });
  }
});

// ==================== RESEND VERIFICATION ====================

/**
 * @route POST /api/auth/resend-verification
 * @desc Resend verification email
 * @access Public
 */
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // Send OTP
    const result = await otpService.sendOTPEmail(email, "verification");

    res.status(200).json({
      success: true,
      message: "Verification email sent",
      data: {
        otpId: result.otpId,
        expiresIn: result.expiresIn,
      },
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Error resending verification",
      error: error.message,
    });
  }
});

// ==================== GET CURRENT USER ====================

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
// router.get("/me", authMiddleware, async (req, res) => {
//   try {
//     const user = await User.findById(req.userId)
//       .select('-password -resetPasswordToken -resetPasswordExpires');

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     res.status(200).json({
//       success: true,
//       data: { user },
//     });
//   } catch (error) {
//     console.error("Get user error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error fetching user",
//       error: error.message,
//     });
//   }
// });

// ==================== UPDATE PROFILE ====================

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
// router.put("/profile", authMiddleware, upload.single('profileImage'), async (req, res) => {
//   try {
//     const {
//       firstName,
//       lastName,
//       phone,
//       address,
//       city,
//       state,
//       country,
//       zipCode,
//       website,
//       description,
//     } = req.body;

//     const user = await User.findById(req.userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Update fields
//     if (firstName) user.firstName = firstName;
//     if (lastName) user.lastName = lastName;
//     if (firstName && lastName) {
//       user.fullName = `${firstName} ${lastName}`;
//     }
//     if (phone) user.phone = phone;
//     if (address) user.address = address;
//     if (city) user.city = city;
//     if (state) user.state = state;
//     if (country) user.country = country;
//     if (zipCode) user.zipCode = zipCode;
//     if (website) user.website = website;
//     if (description) user.description = description;
//     if (req.file) user.profileImage = req.file.path;

//     await user.save();

//     // Log activity
//     await logActivity(user._id, "Profile updated");

//     const userResponse = user.toObject();
//     delete userResponse.password;

//     res.status(200).json({
//       success: true,
//       message: "Profile updated successfully",
//       data: { user: userResponse },
//     });
//   } catch (error) {
//     console.error("Update profile error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error updating profile",
//       error: error.message,
//     });
//   }
// });

// ==================== GET ALL USERS (Admin) ====================

/**
 * @route GET /api/auth/users
 * @desc Get all users (Admin only)
 * @access Private/Admin
 */
// router.get("/users", authMiddleware, async (req, res) => {
//   try {
//     // Check if user is admin
//     const user = await User.findById(req.userId);
//     if (!user || user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. Admin only.",
//       });
//     }

//     const { page = 1, limit = 20, role, search, isApproved } = req.query;

//     const query = {};
//     if (role) query.role = role;
//     if (isApproved !== undefined) query.isApproved = isApproved === 'true';
//     if (search) {
//       query.$or = [
//         { email: { $regex: search, $options: 'i' } },
//         { fullName: { $regex: search, $options: 'i' } },
//         { phone: { $regex: search, $options: 'i' } },
//       ];
//     }

//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const [users, total] = await Promise.all([
//       User.find(query)
//         .select('-password -resetPasswordToken -resetPasswordExpires')
//         .skip(skip)
//         .limit(parseInt(limit))
//         .sort({ createdAt: -1 }),
//       User.countDocuments(query),
//     ]);

//     res.status(200).json({
//       success: true,
//       data: {
//         users,
//         pagination: {
//           page: parseInt(page),
//           limit: parseInt(limit),
//           total,
//           pages: Math.ceil(total / parseInt(limit)),
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Get users error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error fetching users",
//       error: error.message,
//     });
//   }
// });

// ==================== UPDATE USER (Admin) ====================

/**
 * @route PUT /api/auth/users/:id
 * @desc Update user (Admin only)
 * @access Private/Admin
 */
// router.put("/users/:id", authMiddleware, async (req, res) => {
//   try {
//     // Check if user is admin
//     const admin = await User.findById(req.userId);
//     if (!admin || admin.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. Admin only.",
//       });
//     }

//     const { id } = req.params;
//     const { isApproved, isActive, role, permissions } = req.body;

//     const user = await User.findById(id);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Update fields
//     if (isApproved !== undefined) user.isApproved = isApproved;
//     if (isActive !== undefined) user.isActive = isActive;
//     if (role) user.role = role;
//     if (permissions) user.permissions = permissions;

//     await user.save();

//     // Log activity
//     await logActivity(req.userId, "User updated", {
//       targetUserId: id,
//       updates: { isApproved, isActive, role, permissions },
//     });

//     const userResponse = user.toObject();
//     delete userResponse.password;

//     res.status(200).json({
//       success: true,
//       message: "User updated successfully",
//       data: { user: userResponse },
//     });
//   } catch (error) {
//     console.error("Update user error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error updating user",
//       error: error.message,
//     });
//   }
// });

// ==================== DELETE USER (Admin) ====================

/**
 * @route DELETE /api/auth/users/:id
 * @desc Delete user (Admin only)
 * @access Private/Admin
 */
// router.delete("/users/:id", authMiddleware, async (req, res) => {
//   try {
//     // Check if user is admin
//     const admin = await User.findById(req.userId);
//     if (!admin || admin.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. Admin only.",
//       });
//     }

//     const { id } = req.params;

//     // Don't allow deleting self
//     if (id === req.userId) {
//       return res.status(400).json({
//         success: false,
//         message: "Cannot delete your own account",
//       });
//     }

//     const user = await User.findById(id);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     await user.deleteOne();

//     // Log activity
//     await logActivity(req.userId, "User deleted", {
//       targetUserId: id,
//       targetEmail: user.email,
//     });

//     res.status(200).json({
//       success: true,
//       message: "User deleted successfully",
//     });
//   } catch (error) {
//     console.error("Delete user error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error deleting user",
//       error: error.message,
//     });
//   }
// });

module.exports = router;

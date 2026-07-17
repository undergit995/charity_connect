const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../../models/User.js");
const ActivityLog = require("../../models/ActivityLog.js");
const generateTokens = require("../../utils/refreshToken.js");
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require("../../utils/emailService.js");
const {
  getFileUrl,
  validateEmail,
  validatePasswordDetailed,
} = require("../../utils/validators.js");
const Validators = require("../../utils/validators.js");
const { truncate } = require("fs");
const { createVerificationRecord } = require("../../services/verificationService.js");
const Verification = require("../../models/Verification.js");
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "CharityConnectRefreshSecretKey";

const logActivity = async (userId, action, details = {}) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      details,
      timestamp: new Date(),
    });
  } catch (error) {
  }
};

exports.setupAdmin = async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Admin already exists" });
    }

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
    res.status(500).json({
      success: false,
      message: "Error setting up admin",
      error: error.message,
    });
  }
};

exports.register = async (req, res) => {
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

    if (!firstName || !lastName || !email || !password || !phone || !role) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format" });
    }

    const passwordValidation = Validators.validatePasswordDetailed(password);
    if (!passwordValidation.isValid) {
      return res
        .status(400)
        .json({ success: false, message: passwordValidation.errors[0] });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email or phone already exists",
      });
    }

    const normalizedRole = role.toLowerCase();
    if (!["donor", "charity"].includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      password: hashedPassword,
      role: normalizedRole,
      isApproved: true,
      isActive: true,
      emailVerified: true,
      acceptTerms: acceptTerms === "true" || acceptTerms === true,
      address: address || "",
      city: city || "",
      state: state || "",
      country: country || "India",
      zipCode: zipCode || "",
      website: website || "",
      description: description || "",
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

    if (normalizedRole === "charity") {
      const { charityDetails } = req.body;
      if (!charityDetails || !charityDetails.organizationName) {
        return res.status(400).json({
          success: false,
          message: "Organization name is required for charity registration",
        });
      }
      userData.charityDetails = {
        organizationName: charityDetails.organizationName,
        organizationType: charityDetails.organizationType || "Non-Profit",
        registrationNumber: charityDetails.registrationNumber || "",
        verified: false,
      };
    }

    const user = new User(userData);
    await user.save();
    if (user.role === 'charity') {
      await createVerificationRecord(user._id);
    }

    await logActivity(user._id, "User registered", {
      role: normalizedRole,
      email: user.email,
    });
    await sendWelcomeEmail(email, user.fullName, normalizedRole);

    const { accessToken, refreshToken } = generateTokens(user);
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
    // //console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message,
    });
  }
};

exports.login =  async (req, res) => {
    try {
        const { email, password, rememberMe = false } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated. Please contact support."
            });
        }

        // Check if user is deleted
        if (user.isDeleted) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deleted. Please contact support."
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            // Track failed login attempts
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            if (user.failedLoginAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
            }
            await user.save();
            
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Reset failed login attempts on successful login
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;

        // Generate tokens and update last login
        const { accessToken, refreshToken } = generateTokens(user);
        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        // Log activity
        const activity = new ActivityLog({
            userId: user._id,
            action: "User logged in",
            type: "login",
            details: { 
                email: user.email,
                role: user.role,
                timestamp: new Date()
            }
        });
        await activity.save();

        // ✅ Get verification status for charity
        let verificationStatus = null;
        let verification = null;
        let eligibility = null;

        if (user.role === 'charity') {
            // Get verification record
            verification = await Verification.findOne({ charityId: user._id });
            
            if (verification) {
                // Calculate document status
                const requiredDocs = verification.documents.filter(d => d.required);
                const verifiedDocs = requiredDocs.filter(d => d.status === 'verified');
                const rejectedDocs = requiredDocs.filter(d => d.status === 'rejected');
                const submittedDocs = requiredDocs.filter(d => d.status === 'submitted');
                const pendingDocs = requiredDocs.filter(d => d.status === 'pending' || d.status === 'needs-info');

                const isEligible = verifiedDocs.length === requiredDocs.length && rejectedDocs.length === 0;
                const progress = requiredDocs.length > 0 ? (verifiedDocs.length / requiredDocs.length) * 100 : 0;

                verificationStatus = {
                    status: verification.status,
                    isApproved: user.isApproved || false,
                    isVerified: user.isVerified || false,
                    documents: {
                        total: requiredDocs.length,
                        verified: verifiedDocs.length,
                        rejected: rejectedDocs.length,
                        submitted: submittedDocs.length,
                        pending: pendingDocs.length,
                    },
                    progress: Math.round(progress),
                    isEligible: isEligible,
                    missingDocs: pendingDocs.map(d => d.label),
                    lastUpdated: verification.updatedAt,
                    submittedAt: verification.submittedAt,
                    reviewedAt: verification.reviewedAt,
                };

                eligibility = {
                    canCreateCampaigns: isEligible && user.isApproved && user.isVerified,
                    reason: isEligible ? 'All documents verified' : `${pendingDocs.length} document(s) pending verification`,
                };
            } else {
                verificationStatus = { status: 'pending', isApproved: false, isVerified: false, progress: 0, isEligible: false, missingDocs: [] };
                eligibility = {
                    canCreateCampaigns: false,
                    reason: 'Verification record not found. Please try again.',
                };
            }
        }

        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.resetPasswordToken;
        delete userResponse.resetPasswordExpires;

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: userResponse,
                accessToken,
                refreshToken,
                verificationStatus: verificationStatus,
                eligibility: eligibility,
                redirect: getRedirectPath(user.role, verificationStatus, eligibility),
            }
        });

    } catch (error) {
        // //console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Helper function to determine redirect path
const getRedirectPath = (role, verificationStatus, eligibility) => {
    if (role === 'admin') {
        return '/admin/dashboard';
    }
    
    if (role === 'charity') {
        // If charity is not verified, redirect to document upload
        if (!verificationStatus?.isApproved || !verificationStatus?.isVerified) {
            return '/charity/documents';
        }
        // If charity is approved and verified but not eligible
        if (!eligibility?.canCreateCampaigns) {
            return '/charity/documents';
        }
        return '/charity/dashboard';
    }
    
    if (role === 'donor') {
        return '/donor/dashboard';
    }
    
    return '/dashboard';
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Refresh token is required" });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      // //console.log(error.name);
      // //console.log(error.message);
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      user,
      refreshToken,
    );

    res.status(200).json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    // //console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      message: "Error refreshing token",
      error: error.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: true,
        message: "If an account exists, a reset link will be sent,but no account on this email",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      console.error("FATAL: FRONTEND_URL environment variable is not set.");
    }
    const resetUrl = `token=${resetToken}`;

    await sendPasswordResetEmail(email, user.fullName, resetUrl).catch(
      (error) => {
        // //console.error("Forgot password email sending error:", error);
      },
    );

    res.status(200).json({
      success: true,
      message: "If an account exists, a reset link will be sent.",
    });
  } catch (error) {
    // //console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing request",
      error: error.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    const passwordValidation = validatePasswordDetailed(newPassword);
    if (!passwordValidation.isValid) {
      return res
        .status(400)
        .json({ success: false, message: passwordValidation.errors[0] });
    }

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset token." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await logActivity(user._id, "Password reset");

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    // //console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
      error: error.message,
    });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const result = otpService.verifyOTP(email, otp, "verification");
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    user.emailVerified = true;
    await user.save();

    await logActivity(user._id, "Email verified");

    res
      .status(200)
      .json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    // //console.error("Verify email error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying email",
      error: error.message,
    });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.emailVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Email already verified" });
    }

    const result = await otpService.sendOTPEmail(email, "verification");

    res.status(200).json({
      success: true,
      message: "Verification email sent",
      data: { otpId: result.otpId, expiresIn: result.expiresIn },
    });
  } catch (error) {
    // //console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Error resending verification",
      error: error.message,
    });
  }
};

exports.logout = async (req, res) => {
  try {
    await logActivity(req.userId, "User logged out");
    res.status(200).json({ success: true, message: "Logout successful" });
  } catch (error) {
    // //console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Error during logout",
      error: error.message,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }
    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }
    const passwordValidation = validatePasswordDetailed(newPassword);
    if (!passwordValidation.isValid) {
      return res
        .status(400)
        .json({ success: false, message: passwordValidation.errors[0] });
    }
    const user = await User.findById(req.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await logActivity(user._id, "Password changed");
    res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    // //console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "-password -resetPasswordToken -resetPasswordExpires",
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    // //console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      website,
      description,
    } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (firstName && lastName) user.fullName = `${firstName} ${lastName}`;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (city) user.city = city;
    if (state) user.state = state;
    if (country) user.country = country;
    if (zipCode) user.zipCode = zipCode;
    if (website) user.website = website;
    if (description) user.description = description;
    if (req.file) user.profileImage = getFileUrl(req, req.file.path);
    await user.save();
    await logActivity(user._id, "Profile updated");
    const userResponse = user.toObject();
    delete userResponse.password;
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { user: userResponse },
    });
  } catch (error) {
    // //console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search, isApproved } = req.query;
    const query = {};
    if (role) query.role = role;
    if (isApproved !== undefined) query.isApproved = isApproved === "true";
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -resetPasswordToken -resetPasswordExpires")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);
    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    // //console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved, isActive, role, permissions } = req.body;
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (isApproved !== undefined) user.isApproved = isApproved;
    if (isActive !== undefined) user.isActive = isActive;
    if (role) user.role = role;
    if (permissions) user.permissions = permissions;
    await user.save();
    await logActivity(req.userId, "User updated by admin", {
      targetUserId: id,
      updates: { isApproved, isActive, role, permissions },
    });
    const userResponse = user.toObject();
    delete userResponse.password;
    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: { user: userResponse },
    });
  } catch (error) {
    // //console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user",
      error: error.message,
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.userId) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot delete your own account" });
    }
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    await user.deleteOne();
    await logActivity(req.userId, "User deleted by admin", {
      targetUserId: id,
      targetEmail: user.email,
    });
    res
      .status(200)
      .json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    // //console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
};

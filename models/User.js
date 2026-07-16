
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User Schema
const UserSchema = new mongoose.Schema(
  {
    // Basic Information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [2, 'First name must be at least 2 characters'],
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [2, 'Last name must be at least 2 characters'],
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    fullName: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },

    // Contact Information
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    alternateEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
    },

    // Authentication
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    appleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Role and Permissions
    role: {
      type: String,
      enum: ['donor', 'charity', 'admin'],
      default: 'donor',
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },

    // Profile
    profileImage: {
      type: String,
      default: null,
    },
    coverImage: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer-not-to-say'],
      default: 'prefer-not-to-say',
    },


    // Status and Verification
    isActive: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
    },
    verificationTokenExpires: {
      type: Date,
    }, 
    verificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Verification',
  },

    // Password Reset
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },

    // Two-Factor Authentication
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
    },
    backupCodes: {
      type: [String],
      default: [],
    },


    // Preferences
    preferredCurrency: {
      type: String,
      default: 'INR',
    },
    preferredLanguage: {
      type: String,
      default: 'en',
    },
    timezone: {
      type: String,
      default: 'UTC',
    },

    // Donor Specific
    donorPreferences: {
      categories: {
        type: [String],
        default: [],
      },
      causes: {
        type: [String],
        default: [],
      },
      donationAmount: {
        min: Number,
        max: Number,
        average: Number,
      },
      anonymousDonations: {
        type: Boolean,
        default: false,
      },
    },

    // Statistics
    stats: {
      totalDonations: {
        type: Number,
        default: 0,
      },
      totalDonationAmount: {
        type: Number,
        default: 0,
      },
      totalCampaigns: {
        type: Number,
        default: 0,
      },
      totalDonors: {
        type: Number,
        default: 0,
      },
      totalRaised: {
        type: Number,
        default: 0,
      },
      campaignsCompleted: {
        type: Number,
        default: 0,
      },
      followers: {
        type: Number,
        default: 0,
      },
      following: {
        type: Number,
        default: 0,
      },
      impactScore: {
        type: Number,
        default: 0,
      },
      rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      reviews: {
        type: Number,
        default: 0,
      },
    },

    // Activity Tracking
    lastLogin: {
      type: Date,
    },
    lastActive: {
      type: Date,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
    },

    // Devices
    devices: [{
      deviceId: String,
      deviceType: {
        type: String,
        enum: ['web', 'mobile', 'tablet', 'other'],
      },
      browser: String,
      os: String,
      lastUsed: Date,
      ipAddress: String,
      userAgent: String,
      isTrusted: {
        type: Boolean,
        default: false,
      },
    }],

    // Referrals
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referralCount: {
      type: Number,
      default: 0,
    },

    // Saved Items
    savedCampaigns: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
    }],
    savedCharities: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    }],

    // Donation History (Summary)
    recentDonations: [{
      campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
      },
      amount: Number,
      date: {
        type: Date,
        default: Date.now,
      },
    }],

    
    acceptTerms: {
      type: Boolean,
      default: false,
    },
    termsAcceptedAt: {
      type: Date,
    },
    termsVersion: {
      type: String,
    },

    // Privacy
    privacySettings: {
      profileVisibility: {
        type: String,
        enum: ['public', 'registered', 'private'],
        default: 'public',
      },
      donationVisibility: {
        type: String,
        enum: ['public', 'anonymous'],
        default: 'public',
      },
      showEmail: {
        type: Boolean,
        default: false,
      },
      showPhone: {
        type: Boolean,
        default: false,
      },
    },

    // Deletion/Inactive
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletionReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ isApproved: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'address.city': 1 });
UserSchema.index({ 'address.country': 1 });
UserSchema.index({ fullName: 'text', email: 'text', bio: 'text' });

// ==================== VIRTUALS ====================

UserSchema.virtual('isAdmin').get(function() {
  return this.role === 'admin';
});

UserSchema.virtual('isCharity').get(function() {
  return this.role === 'charity';
});

UserSchema.virtual('isDonor').get(function() {
  return this.role === 'donor';
});

UserSchema.virtual('isVerifiedCharity').get(function() {
  return this.role === 'charity' && this.charityDetails?.verified === true;
});

UserSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

UserSchema.virtual('displayName').get(function() {
  return this.fullName || `${this.firstName} ${this.lastName}` || this.email;
});

// ==================== PRE-SAVE MIDDLEWARE ====================

// Update fullName before saving
UserSchema.pre('save', function() {
  if (this.firstName && this.lastName) {
    this.fullName = `${this.firstName} ${this.lastName}`;
  } else if (this.firstName) {
    this.fullName = this.firstName;
  }
});

// Hash password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const isAlreadyHashed = this.password.startsWith('$2b$') || this.password.startsWith('$2a$');

  if (!isAlreadyHashed) {
    const bcrypt = require('bcrypt');
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// ==================== INSTANCE METHODS ====================

// Compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate auth token
UserSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'CharityConnectSecretKey';
  
  return jwt.sign(
    {
      id: this._id,
      userId: this._id,
      email: this.email,
      role: this.role,
      permissions: this.permissions || [],
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Check if user has permission
UserSchema.methods.hasPermission = function(permission) {
  if (this.role === 'admin') return true;
  if (this.permissions.includes('*')) return true;
  return this.permissions.includes(permission);
};

// Check if user has role
UserSchema.methods.hasRole = function(role) {
  return this.role === role;
};

// Update last activity
UserSchema.methods.updateActivity = function() {
  this.lastActive = new Date();
  return this.save();
};

// Increment login count
UserSchema.methods.incrementLogin = function() {
  this.loginCount += 1;
  this.lastLogin = new Date();
  return this.save();
};

// ==================== STATIC METHODS ====================

// Find by email
UserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Find active users
UserSchema.statics.findActive = function() {
  return this.find({ isActive: true, isDeleted: false });
};

// Get donor stats
UserSchema.statics.getDonorStats = async function() {
  const stats = await this.aggregate([
    { $match: { role: 'donor', isActive: true, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalDonors: { $sum: 1 },
        totalDonationAmount: { $sum: '$stats.totalDonationAmount' },
        totalDonations: { $sum: '$stats.totalDonations' },
        averageDonation: { $avg: '$stats.totalDonationAmount' },
      },
    },
  ]);
  return stats[0] || { totalDonors: 0, totalDonationAmount: 0, totalDonations: 0, averageDonation: 0 };
};

// Get charity stats
UserSchema.statics.getCharityStats = async function() {
  const stats = await this.aggregate([
    { $match: { role: 'charity', isActive: true, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalCharities: { $sum: 1 },
        totalRaised: { $sum: '$stats.totalRaised' },
        totalCampaigns: { $sum: '$stats.totalCampaigns' },
        averageRaised: { $avg: '$stats.totalRaised' },
        verifiedCharities: {
          $sum: { $cond: ['$charityDetails.verified', 1, 0] },
        },
      },
    },
  ]);
  return stats[0] || { totalCharities: 0, totalRaised: 0, totalCampaigns: 0, averageRaised: 0, verifiedCharities: 0 };
};

// Search users
UserSchema.statics.searchUsers = async function(searchTerm, options = {}) {
  const { limit = 10, page = 1, role } = options;
  const skip = (page - 1) * limit;
  
  const query = {
    $text: { $search: searchTerm },
    isDeleted: false,
  };
  
  if (role) query.role = role;
  
  const [users, total] = await Promise.all([
    this.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .skip(skip)
      .limit(limit)
      .sort({ score: { $meta: 'textScore' } }),
    this.countDocuments(query),
  ]);
  
  return { users, total, page, limit, pages: Math.ceil(total / limit) };
};


UserSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    delete ret.verificationToken;
    delete ret.verificationTokenExpires;
    delete ret.twoFactorSecret;
    delete ret.backupCodes;
    delete ret.__v;
    return ret;
  },
});


const AuthModel = mongoose.model('User', UserSchema);

module.exports = AuthModel;
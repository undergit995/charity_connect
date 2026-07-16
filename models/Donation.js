const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    // Donor Information
    donorId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: false // Optional for guest donations
    },
    donorName: { 
      type: String, 
      required: false,
      trim: true
    },
    donorEmail: { 
      type: String, 
      required: false,
      trim: true,
      lowercase: true
    },
    donorPhone: { 
      type: String, 
      required: false,
      trim: true
    },

    // Campaign Information
    campaignId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Campaign", 
      required: true 
    },
    charityId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    // Donation Details
    amount: { 
      type: Number, 
      required: [true, "Donation amount is required"],
      min: [1, "Minimum donation amount is $1"]
    },
    currency: { 
      type: String, 
      default: "USD",
      enum: ["USD", "EUR", "GBP", "INR"]
    }, // Track if donation exceeded goal
    exceededGoal: {
      type: Boolean,
      default: false,
    },

    // Over-goal donation tracking
    overGoalAmount: {
      type: Number,
      default: 0,
    },

    // Payment Information
    paymentMethod: { 
      type: String, 
      enum: ["UPI", "Net Banking", "Credit Card", "Debit Card", "Wallet", "Cheque", "Bank Transfer", "razorpay", "stripe", "paypal"], 
      default: "razorpay"
    },
    transactionId: { 
      type: String, 
      unique: true,
      sparse:true,
      trim: true
    },
    paymentGateway: {
      type: String,
      enum: ["razorpay", "stripe", "paypal", "instamojo", "other"],
      default: "razorpay"
    },

    // Donation Status
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed", "Refunded", "Disputed"],
      default: "Pending"
    },

    // Razorpay Specific Fields
    razorpayOrderId: { 
      type: String, 
      required: false,
      trim: true
    },
    razorpayPaymentId: { 
      type: String, 
      required: false,
      trim: true
    },
    razorpaySignature: { 
      type: String, 
      required: false,
      trim: true
    },

    // Stripe Specific Fields
    stripePaymentIntentId: { 
      type: String, 
      required: false,
      trim: true
    },
    stripeCustomerId: { 
      type: String, 
      required: false,
      trim: true
    },

    // PayPal Specific Fields
    paypalOrderId: { 
      type: String, 
      required: false,
      trim: true
    },
    paypalCaptureId: { 
      type: String, 
      required: false,
      trim: true
    },

    // Donation Preferences
    isAnonymous: { 
      type: Boolean, 
      default: false 
    },
    message: { 
      type: String, 
      required: false,
      maxlength: [500, "Message cannot exceed 500 characters"],
      trim: true
    },

    // Tax & Compliance
    panNumber: { 
      type: String, 
      required: false,
      trim: true
    },
    is80GEligible: { 
      type: Boolean, 
      default: false 
    },
    certificateUrl: { 
      type: String, 
      required: false,
      trim: true
    },
    taxReceiptGenerated: { 
      type: Boolean, 
      default: false 
    },
    taxReceiptUrl: { 
      type: String, 
      required: false,
      trim: true
    },

    // Receipt
    receiptUrl: { 
      type: String, 
      required: false,
      trim: true
    },
    receiptNumber: { 
      type: String, 
      required: false,
    },

    // Timestamps
    donationDate: { 
      type: Date, 
      default: Date.now 
    },
    completedAt: { 
      type: Date, 
      required: false 
    },
    refundedAt: { 
      type: Date, 
      required: false 
    },
    disputedAt: { 
      type: Date, 
      required: false 
    },

    // Refund Information
    refundReason: { 
      type: String, 
      required: false,
      trim: true
    },
    refundedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      required: false 
    },
    refundTransactionId: { 
      type: String, 
      required: false,
      trim: true
    },

    // Corporate Donations
    companyId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Company", 
      required: false 
    },
    companyName: { 
      type: String, 
      required: false,
      trim: true
    },

    // Recurring Donations
    isRecurring: { 
      type: Boolean, 
      default: false 
    },
    recurringId: { 
      type: String, 
      required: false,
      trim: true
    },
    recurringFrequency: {
      type: String,
      enum: ["monthly", "quarterly", "yearly", "one-time"],
      default: "one-time"
    },

    // Matching Gifts
    isMatchingGift: { 
      type: Boolean, 
      default: false 
    },
    matchingCompanyId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Company",
      required: false 
    },
    matchingAmount: { 
      type: Number, 
      required: false 
    },

    // Analytics
    ipAddress: { 
      type: String, 
      required: false 
    },
    userAgent: { 
      type: String, 
      required: false 
    },
    referrer: { 
      type: String, 
      required: false 
    },
    utmSource: { 
      type: String, 
      required: false 
    },
    utmMedium: { 
      type: String, 
      required: false 
    },
    utmCampaign: { 
      type: String, 
      required: false 
    },

    // Notes
    adminNotes: { 
      type: String, 
      required: false,
      trim: true
    },
    donorNotes: { 
      type: String, 
      required: false,
      trim: true
    },

    // Metadata
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    },
    
    __v: { 
      type: Number, 
      default: 0 
    },
    lockedUntil: { 
      type: Date, 
      default: null 
    },
    lockedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      default: null 
    },
    lastModifiedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    lastModifiedAt: { 
      type: Date, 
      default: Date.now 
    },
    conflictResolution: {
      resolved: { type: Boolean, default: false },
      resolvedAt: { type: Date },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      resolutionStrategy: { 
        type: String, 
        enum: ["auto", "manual", "latest", "merge"],
        default: "auto" 
      },
      previousVersion: { type: mongoose.Schema.Types.Mixed }
    }
  },
  { 
    timestamps: true 
  }
);

// ==================== INDEXES ====================

// Basic indexes
donationSchema.index({ campaignId: 1, status: 1 });
donationSchema.index({ donorId: 1, status: 1 });
donationSchema.index({ charityId: 1, status: 1 });
donationSchema.index({ donationDate: -1 });
donationSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });
donationSchema.index({ status: 1, createdAt: -1 });
donationSchema.index({ exceededGoal: 1, campaignId: 1 });

// Compound indexes for reporting
donationSchema.index({ donationDate: -1, status: 1 });
donationSchema.index({ campaignId: 1, donationDate: -1 });
donationSchema.index({ charityId: 1, donationDate: -1, status: 1 });

// Indexes for locking
donationSchema.index({ lockedUntil: 1 });
donationSchema.index({ "conflictResolution.resolved": 1 });
// Text search index
donationSchema.index({ 
  donorName: "text", 
  donorEmail: "text", 
  transactionId: "text",
  receiptNumber: "text"
});

// ==================== MIDDLEWARE ====================

// Generate receipt number before saving
donationSchema.pre("save", async function() {
  try {
    if (!this.receiptNumber && this.status === "Completed") {
      const prefix = "DON";
      const year = new Date().getFullYear();
      const count = await mongoose.model("Donation").countDocuments();
      this.receiptNumber = `${prefix}-${year}-${String(count + 1).padStart(6, "0")}`;
    }
    
    if (this.status === "Completed" && !this.completedAt) {
      this.completedAt = new Date();
    }
    
    if (this.status === "Refunded" && !this.refundedAt) {
      this.refundedAt = new Date();
    }
    
    
  } catch (error) {
    console.log(error);
  }
});

// ==================== VIRTUALS ====================

// Virtual for formatted amount
donationSchema.virtual("formattedAmount").get(function() {
  const symbol = this.currency === "INR" ? "₹" : "$";
  return `${symbol}${this.amount.toLocaleString()}`;
});

// Virtual for donation status label
donationSchema.virtual("statusLabel").get(function() {
  const statusMap = {
    "Pending": "⏳ Pending",
    "Completed": "✅ Completed",
    "Failed": "❌ Failed",
    "Refunded": "🔄 Refunded",
    "Disputed": "⚠️ Disputed"
  };
  return statusMap[this.status] || this.status;
});

// Virtual for isGuestDonor
donationSchema.virtual("isGuestDonor").get(function() {
  return !this.donorId;
});

// Virtual for days since donation
donationSchema.virtual("daysSince").get(function() {
  if (!this.donationDate) return null;
  const diff = Date.now() - new Date(this.donationDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

// ==================== INSTANCE METHODS ====================

// Mark donation as completed
donationSchema.methods.markCompleted = async function(transactionId = null) {
  this.status = "Completed";
  this.completedAt = new Date();
  if (transactionId) {
    this.transactionId = transactionId;
  }
  
  // Update campaign raised amount
  await this.populate("campaignId");
  if (this.campaignId) {
    this.campaignId.raisedAmount += this.amount;
    this.campaignId.stats.donorCount += 1;
    this.campaignId.stats.averageDonation = 
      this.campaignId.raisedAmount / this.campaignId.stats.donorCount;
    await this.campaignId.save();
  }
  
  return this.save();
};

// Mark donation as failed
donationSchema.methods.markFailed = async function(reason = null) {
  this.status = "Failed";
  if (reason) {
    this.adminNotes = reason;
  }
  return this.save();
};

// Refund donation
donationSchema.methods.refund = async function(reason, refundedBy = null) {
  if (this.status !== "Completed") {
    throw new Error("Only completed donations can be refunded");
  }
  
  this.status = "Refunded";
  this.refundedAt = new Date();
  this.refundReason = reason;
  if (refundedBy) {
    this.refundedBy = refundedBy;
  }
  
  // Deduct from campaign raised amount
  await this.populate("campaignId");
  if (this.campaignId) {
    this.campaignId.raisedAmount -= this.amount;
    this.campaignId.stats.donorCount -= 1;
    this.campaignId.stats.averageDonation = 
      this.campaignId.raisedAmount > 0 && this.campaignId.stats.donorCount > 0
        ? this.campaignId.raisedAmount / this.campaignId.stats.donorCount
        : 0;
    await this.campaignId.save();
  }
  
  return this.save();
};

// Generate tax receipt
donationSchema.methods.generateTaxReceipt = async function() {
  if (this.status !== "Completed") {
    throw new Error("Only completed donations can generate tax receipts");
  }
  
  if (!this.is80GEligible) {
    throw new Error("This donation is not eligible for 80G tax exemption");
  }
  
  this.taxReceiptGenerated = true;
  // In production, generate PDF and upload to cloud storage
  this.taxReceiptUrl = `/receipts/${this.receiptNumber}.pdf`;
  return this.save();
};

// ==================== STATIC METHODS ====================

// Get donation summary for a campaign
donationSchema.statics.getCampaignSummary = async function(campaignId) {
  const summary = await this.aggregate([
    { $match: { campaignId: mongoose.Types.ObjectId(campaignId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        avgAmount: { $avg: "$amount" },
        minAmount: { $min: "$amount" },
        maxAmount: { $max: "$amount" }
      }
    }
  ]);
  
  const total = await this.aggregate([
    { $match: { campaignId: mongoose.Types.ObjectId(campaignId) } },
    {
      $group: {
        _id: null,
        totalDonations: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        avgAmount: { $avg: "$amount" }
      }
    }
  ]);
  
  return {
    breakdown: summary,
    totals: total[0] || { totalDonations: 0, totalAmount: 0, avgAmount: 0 }
  };
};

// Get donation summary for a charity
donationSchema.statics.getCharitySummary = async function(charityId) {
  const summary = await this.aggregate([
    { $match: { charityId: mongoose.Types.ObjectId(charityId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" }
      }
    }
  ]);
  
  const total = await this.aggregate([
    { $match: { charityId: mongoose.Types.ObjectId(charityId) } },
    {
      $group: {
        _id: null,
        totalDonors: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        avgDonation: { $avg: "$amount" }
      }
    }
  ]);
  
  return {
    breakdown: summary,
    totals: total[0] || { totalDonors: 0, totalAmount: 0, avgDonation: 0 }
  };
};

// Get monthly donation stats
donationSchema.statics.getMonthlyStats = async function(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const stats = await this.aggregate([
    {
      $match: {
        status: "Completed",
        donationDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $dayOfMonth: "$donationDate" },
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  return stats;
};

// Find donations for export
donationSchema.statics.findForExport = async function(filters = {}) {
  const query = { status: "Completed" };
  
  if (filters.campaignId) {
    query.campaignId = filters.campaignId;
  }
  
  if (filters.charityId) {
    query.charityId = filters.charityId;
  }
  
  if (filters.startDate || filters.endDate) {
    query.donationDate = {};
    if (filters.startDate) query.donationDate.$gte = new Date(filters.startDate);
    if (filters.endDate) query.donationDate.$lte = new Date(filters.endDate);
  }
  
  return this.find(query)
    .populate("donorId", "fullName email phone")
    .populate("campaignId", "title")
    .sort({ donationDate: -1 });
};

// ==================== TOJSON TRANSFORM ====================

donationSchema.set("toJSON", {
  transform: function(doc, ret) {
    ret.formattedAmount = doc.formattedAmount;
    ret.statusLabel = doc.statusLabel;
    ret.isGuestDonor = doc.isGuestDonor;
    ret.daysSince = doc.daysSince;
    delete ret.__v;
    return ret;
  }
});

// ==================== EXPORT ====================

const Donation = mongoose.model("Donation", donationSchema);
module.exports = Donation;
const mongoose = require("mongoose");

// Campaign Update Schema
const CampaignUpdateSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: [100, "Title cannot exceed 100 characters"]
    },
    content: { 
        type: String, 
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ["general", "milestone", "urgent", "thank_you"],
        default: "general"
    },
    images: { 
        type: [String], 
        default: [] 
    },
    donorsNotified: { 
        type: Boolean, 
        default: false 
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Campaign Schema
const CampaignSchema = new mongoose.Schema({
    // Basic Information
    title: { 
        type: String, 
        required: [true, "Campaign title is required"],
        trim: true,
        maxlength: [100, "Title cannot exceed 100 characters"]
    },
    slug: { 
        type: String, 
        unique: true,
        sparse: true
    },
    shortDescription: { 
        type: String, 
        trim: true,
        maxlength: [200, "Short description cannot exceed 200 characters"]
    },
    description: { 
        type: String, 
        required: [true, "Campaign description is required"],
        trim: true
    },
    category: { 
        type: String, 
        required: [true, "Category is required"],
        enum: [
            "Medical", "Education", "Food", "Disaster Relief", 
            "Animal Welfare", "Children", "Women", "Elderly", 
            "Environment", "Community", "Other"
        ]
    },
    subCategory: { 
        type: String, 
        trim: true 
    },

    // Media
    coverImage: { 
        type: String,
        required: [true, "Cover image is required"]
    },
    campaignImages: { 
        type: [String], 
        default: [] 
    },
    video: { 
        type: String, 
        trim: true 
    },
    documents: { 
        type: [String], 
        default: [] 
    },
    proofDocs: { 
        type: [String], 
        default: [] 
    },

    // Financial
    goalAmount: { 
        type: Number, 
        required: [true, "Goal amount is required"],
        min: [100, "Goal amount must be at least $100"]
    },
    raisedAmount: { 
        type: Number, 
        default: 0 
    },
    currency: { 
        type: String, 
        default: "USD" 
    },
    minimumDonation: { 
        type: Number, 
        default: 1 
    },

    // Dates
    startDate: { 
        type: Date, 
        default: Date.now 
    },
    endDate: { 
        type: Date, 
        required: [true, "End date is required"]
    },

    // Location
    location: { 
        type: String, 
        trim: true 
    },
    address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        country: { type: String, default: "India" },
        zipCode: { type: String, trim: true }
    },

    // Beneficiary Information
    beneficiaryInfo: { 
        type: String, 
        trim: true 
    },
    beneficiariesCount: { 
        type: Number, 
        default: 0 
    },
    impactDetails: { 
        type: String, 
        trim: true 
    },

    // Relationships
    charityId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: [true, "Charity ID is required"]
    },
    ngoId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "NGO" 
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
    },

    // Status & Approval
    status: {
        type: String,
        enum: ["draft", "pending", "active", "paused", "completed", "cancelled"],
        default: "draft"
    },
    approvalStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    adminNote: { 
        type: String, 
        trim: true 
    },
    approvedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
    },
    approvedAt: { 
        type: Date 
    },
    rejectionReason: { 
        type: String, 
        trim: true 
    },

    // Donation Link
    donationLink: { 
        type: String,
    },

    // Statistics
    stats: {
        donorCount: { 
            type: Number, 
            default: 0 
        },
        views: { 
            type: Number, 
            default: 0 
        },
        shares: { 
            type: Number, 
            default: 0 
        },
        saves: { 
            type: Number, 
            default: 0 
        },
        averageDonation: { 
            type: Number, 
            default: 0 
        }
    },

    // Updates
    updates: [CampaignUpdateSchema],

    // Features
    isFeatured: { 
        type: Boolean, 
        default: false 
    },
    isVerified: { 
        type: Boolean, 
        default: false 
    },
    isActive: { 
        type: Boolean, 
        default: false 
    },
    isDeleted: { 
        type: Boolean, 
        default: false 
    },
    deletedAt: { 
        type: Date 
    },

    // Metadata
    tags: { 
        type: [String], 
        default: [] 
    },
    keywords: { 
        type: [String], 
        default: [] 
    },
  __v: {
    type: Number,
    default: 0,
  },
  lockedUntil: {
    type: Date,
    default: null,
  },
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // Donation Tracking
  raisedAmount: {
    type: Number,
    default: 0,
  },
  stats: {
    donorCount: {
      type: Number,
      default: 0,
    },
    averageDonation: {
      type: Number,
      default: 0,
    },
    lastDonationAt: {
      type: Date,
    },
  },
    
},{
    timestamps: true
});

// ==================== INDEXES ====================

CampaignSchema.index({ charityId: 1 });
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ approvalStatus: 1 });
CampaignSchema.index({ category: 1 });
CampaignSchema.index({ isActive: 1 });
CampaignSchema.index({ endDate: 1 });
CampaignSchema.index({ createdAt: -1 });
CampaignSchema.index({ title: "text", description: "text", shortDescription: "text" });
CampaignSchema.index({ donationLink: 1 }, { unique: true });
CampaignSchema.index({ status: 1, isActive: 1 });
CampaignSchema.index({ raisedAmount: 1, goalAmount: 1 });
CampaignSchema.index({ __v: 1 });


// ==================== PRE-SAVE MIDDLEWARE ====================

// Generate slug and donation link before saving
CampaignSchema.pre("save", async function() {
    // Generate slug from title
    if (this.isModified("title")) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
        
        // Add timestamp to ensure uniqueness
        this.slug = `${this.slug}-${Date.now().toString(36)}`;
    }

    // Generate unique donation link
    if (!this.donationLink) {
        const randomStr = Math.random().toString(36).substring(2, 8);
        const nameSlug = this.title
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .substring(0, 30);
        this.donationLink = `${nameSlug}-${randomStr}`;
    }

    // Update status based on approval
    if (this.approvalStatus === "approved" && this.status === "pending") {
        this.status = "active";
        this.isActive = true;
    }

    // Update raised amount stats
    if (this.isModified("raisedAmount")) {
        this.stats.averageDonation = this.stats.donorCount > 0 
            ? this.raisedAmount / this.stats.donorCount 
            : 0;
    }

});

// ==================== VIRTUALS ====================

// Virtual for days remaining
CampaignSchema.virtual("daysRemaining").get(function() {
    if (!this.endDate) return null;
    const now = new Date();
    const end = new Date(this.endDate);
    const diff = end - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for progress percentage
CampaignSchema.virtual("progress").get(function() {
    if (this.goalAmount <= 0) return 0;
    return Math.min((this.raisedAmount / this.goalAmount) * 100, 100);
});

// Virtual for isExpired
CampaignSchema.virtual("isExpired").get(function() {
    if (!this.endDate) return false;
    return new Date() > new Date(this.endDate);
});

// Virtual for isUrgent
CampaignSchema.virtual("isUrgent").get(function() {
    return this.daysRemaining !== null && this.daysRemaining <= 7;
});

// ==================== INSTANCE METHODS ====================

// Check if campaign can receive donations
CampaignSchema.methods.canReceiveDonations = function() {
    return this.status === "active" && 
           this.isActive && 
           this.approvalStatus === "approved" && 
           !this.isExpired &&
           !this.isDeleted;
};

// Add donation
CampaignSchema.methods.addDonation = async function(amount) {
    this.raisedAmount += amount;
    this.stats.donorCount += 1;
    this.stats.averageDonation = this.raisedAmount / this.stats.donorCount;
    return this.save();
};

// Add view
CampaignSchema.methods.addView = function() {
    this.stats.views += 1;
    return this.save();
};

// Add share
CampaignSchema.methods.addShare = function() {
    this.stats.shares += 1;
    return this.save();
};

// Add save
CampaignSchema.methods.addSave = function() {
    this.stats.saves += 1;
    return this.save();
};

// Add update
CampaignSchema.methods.addUpdate = async function(updateData) {
    this.updates.push(updateData);
    return this.save();
};

// ==================== STATIC METHODS ====================

// Find active campaigns
CampaignSchema.statics.findActive = function() {
    const now = new Date();
    return this.find({
        status: "active",
        isActive: true,
        approvalStatus: "approved",
        endDate: { $gt: now },
        isDeleted: false
    }).sort({ createdAt: -1 });
};

// Find featured campaigns
CampaignSchema.statics.findFeatured = function(limit = 4) {
    const now = new Date();
    return this.find({
        isFeatured: true,
        status: "active",
        isActive: true,
        approvalStatus: "approved",
        endDate: { $gt: now },
        isDeleted: false
    }).sort({ createdAt: -1 }).limit(limit);
};

// Find urgent campaigns
CampaignSchema.statics.findUrgent = function(limit = 4) {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    return this.find({
        status: "active",
        isActive: true,
        approvalStatus: "approved",
        endDate: { $gt: now, $lt: sevenDaysFromNow },
        isDeleted: false
    }).sort({ endDate: 1 }).limit(limit);
};

// Search campaigns
CampaignSchema.statics.searchCampaigns = async function(searchTerm, options = {}) {
    const { limit = 10, page = 1, category, status, sort = "recent" } = options;
    const skip = (page - 1) * limit;
    
    const query = {
        isDeleted: false,
        approvalStatus: "approved"
    };
    
    if (searchTerm) {
        query.$text = { $search: searchTerm };
    }
    
    if (category) {
        query.category = category;
    }
    
    if (status) {
        query.status = status;
    }
    
    let sortOption = {};
    switch (sort) {
        case "recent":
            sortOption = { createdAt: -1 };
            break;
        case "popular":
            sortOption = { "stats.donorCount": -1 };
            break;
        case "ending":
            sortOption = { endDate: 1 };
            break;
        case "goal":
            sortOption = { goalAmount: 1 };
            break;
        default:
            sortOption = { createdAt: -1 };
    }
    
    const [campaigns, total] = await Promise.all([
        this.find(query)
            .skip(skip)
            .limit(limit)
            .sort(sortOption)
            .populate("charityId", "fullName email profileImage charityDetails.organizationName"),
        this.countDocuments(query)
    ]);
    
    return {
        campaigns,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

// Get campaign stats for charity
CampaignSchema.statics.getCharityStats = async function(charityId) {
    const stats = await this.aggregate([
        { $match: { charityId: charityId, isDeleted: false } },
        {
            $group: {
                _id: null,
                totalCampaigns: { $sum: 1 },
                activeCampaigns: { 
                    $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
                },
                completedCampaigns: { 
                    $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
                },
                totalRaised: { $sum: "$raisedAmount" },
                totalDonors: { $sum: "$stats.donorCount" },
                averageRaised: { $avg: "$raisedAmount" }
            }
        }
    ]);
    
    return stats[0] || {
        totalCampaigns: 0,
        activeCampaigns: 0,
        completedCampaigns: 0,
        totalRaised: 0,
        totalDonors: 0,
        averageRaised: 0
    };
};

// ==================== TOJSON TRANSFORM ====================

CampaignSchema.set("toJSON", {
    transform: function(doc, ret) {
        ret.daysRemaining = doc.daysRemaining;
        ret.progress = doc.progress;
        ret.isExpired = doc.isExpired;
        ret.isUrgent = doc.isUrgent;
        delete ret.__v;
        return ret;
    }
});

// ==================== EXPORT ====================

const Campaign = mongoose.model("Campaign", CampaignSchema);
module.exports = Campaign;
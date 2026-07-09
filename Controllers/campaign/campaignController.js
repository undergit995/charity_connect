const mongoose = require("mongoose");
const Campaign = require("../../models/CampaignModel");
const User = require("../../models/User");
const { deleteFile } = require("../../config/multerConfig");
const { sendEmail } = require("../../config/mailConfig");
const Donation = require("../../models/Donation");

// ==================== CREATE CAMPAIGN ====================

/**
 * @route POST /api/campaigns
 * @desc Create a new campaign
 * @access Private (Charity only)
 */
exports.createCampaign = async (req, res) => {
    try {
        const {
            title,
            category,
            description,
            shortDescription,
            goalAmount,
            endDate,
            location,
            beneficiaryInfo,
            impactDetails,
            address,
        } = req.body;

        // Validate required fields
        if (!title || !category || !description || !goalAmount || !endDate) {
            // Clean up uploaded files if validation fails
            if (req.files?.coverImage) deleteFile(req.files.coverImage[0].path);
            if (req.files?.campaignImages) req.files.campaignImages.forEach(f => deleteFile(f.path));

            return res.status(400).json({
                success: false,
                message: "Title, category, description, goal amount, and end date are required"
            });
        }

        // Check if user is a charity
        const user = await User.findById(req.userId);
        if (!user || user.role !== "charity") {
            if (req.files?.coverImage) deleteFile(req.files.coverImage[0].path);
            if (req.files?.campaignImages) req.files.campaignImages.forEach(f => deleteFile(f.path));
            return res.status(403).json({
                success: false,
                message: "Only charities can create campaigns"
            });
        }

        // Check if charity is approved
        if (!user.isApproved) {
            if (req.files?.coverImage) deleteFile(req.files.coverImage[0].path);
            if (req.files?.campaignImages) req.files.campaignImages.forEach(f => deleteFile(f.path));
            return res.status(403).json({
                success: false,
                message: "Your charity account must be approved before creating campaigns"
            });
        }

        // Parse address if provided as JSON string
        let parsedAddress = {};
        if (address) {
            try {
                parsedAddress = typeof address === "string" ? JSON.parse(address) : address;
            } catch (e) {
                parsedAddress = {};
            }
        }

        const filesArray = Array.isArray(req.files) 
            ? req.files 
            : (req.files?.campaignImages || []);

        // 3. Extract the first one as cover, and the remaining ones as gallery
        const coverImage = filesArray.length > 0 ? filesArray[0].path : null;
        const campaignImages = filesArray.length > 1 ? filesArray.slice(1).map(f => f.path) : [];

        // 4. Validation & cleanup fallback
        if (!coverImage) {
             if (filesArray.length > 0) {
                 filesArray.forEach(f => deleteFile(f.path));
             }
             return res.status(400).json({ success: false, message: "Cover image is required. Please upload at least one image." });
        }
        // Create campaign
        const campaignData = {
            title,
            category,
            description,
            shortDescription: shortDescription || "",
            goalAmount: parseFloat(goalAmount),
            endDate: new Date(endDate),
            location: location || "",
            beneficiaryInfo: beneficiaryInfo || "",
            impactDetails: impactDetails || "",
            address: parsedAddress,
            coverImage,
            campaignImages,
            charityId: req.userId,
            createdBy: req.userId,
            status: "pending",
            approvalStatus: "pending",
            isActive: false,
        };

        const campaign = new Campaign(campaignData);
        await campaign.save();

        // Update user stats
        user.stats = user.stats || {};
        user.stats.totalCampaigns = (user.stats.totalCampaigns || 0) + 1;
        await user.save();

        res.status(201).json({
            success: true,
            message: "Campaign created successfully! It will be reviewed by admin.",
            data: campaign
        });

    } catch (error) {
        console.error("Create campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create campaign",
            error: error.message
        });
    }
};

// ==================== GET ALL CAMPAIGNS ====================

/**
 * @route GET /api/campaigns
 * @desc Get all campaigns with filters
 * @access Public
 */
exports.getAllCampaigns = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            category,
            status,
            sort = "recent",
            charityId,
            isFeatured,
            isUrgent,
        } = req.query;

        const query = {
            isDeleted: false,
            approvalStatus: "approved"
        };

        // Filter by status
        if (status && status !== "all") {
            query.status = status;
        }

        // Filter by category
        if (category && category !== "all") {
            query.category = category;
        }

        // Filter by charity
        if (charityId) {
            query.charityId = charityId;
        }

        // Filter featured
        if (isFeatured === "true") {
            query.isFeatured = true;
        }

        // Filter urgent (ending in 7 days)
        if (isUrgent === "true") {
            const now = new Date();
            const sevenDaysFromNow = new Date(now);
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
            query.endDate = { $gt: now, $lt: sevenDaysFromNow };
            query.status = "active";
        }

        // Search
        if (search) {
            query.$text = { $search: search };
        }

        // Sort options
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

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [campaigns, total] = await Promise.all([
            Campaign.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort(sortOption)
                .populate("charityId", "fullName email profileImage charityDetails.organizationName charityDetails.verified")
                .populate("createdBy", "fullName email"),
            Campaign.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: campaigns,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error("Get campaigns error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaigns",
            error: error.message
        });
    }
};

// ==================== GET SINGLE CAMPAIGN ====================

/**
 * @route GET /api/campaigns/:id
 * @desc Get campaign by ID
 * @access Public
 */
exports.getCampaignById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id)
            .populate("charityId", "fullName email profileImage bio charityDetails.organizationName charityDetails.verified charityDetails.missionStatement charityDetails.socialMedia")
            .populate("createdBy", "fullName email")
            .populate("updates.createdBy", "fullName email profileImage");

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Increment views
        await campaign.addView();

        res.status(200).json({
            success: true,
            data: campaign
        });

    } catch (error) {
        console.error("Get campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaign",
            error: error.message
        });
    }
};

// ==================== GET CAMPAIGN BY SLUG ====================

/**
 * @route GET /api/campaigns/slug/:slug
 * @desc Get campaign by slug
 * @access Public
 */
exports.getCampaignBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const campaign = await Campaign.findOne({ slug, isDeleted: false })
            .populate("charityId", "fullName email profileImage bio charityDetails.organizationName charityDetails.verified charityDetails.missionStatement charityDetails.socialMedia")
            .populate("createdBy", "fullName email")
            .populate("updates.createdBy", "fullName email profileImage");

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Increment views
        await campaign.addView();

        res.status(200).json({
            success: true,
            data: campaign
        });

    } catch (error) {
        console.error("Get campaign by slug error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaign",
            error: error.message
        });
    }
};

// ==================== UPDATE CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id
 * @desc Update campaign
 * @access Private (Charity owner only)
 */
exports.updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Check if user is the owner
        if (campaign.charityId.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this campaign"
            });
        }

        // Check if campaign can be edited
        if (campaign.status === "completed" || campaign.status === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "Completed or cancelled campaigns cannot be edited"
            });
        }

        const {
            title,
            category,
            description,
            shortDescription,
            goalAmount,
            endDate,
            location,
            beneficiaryInfo,
            impactDetails,
            address,
            isFeatured,
        } = req.body;

        // Update fields
        if (title) campaign.title = title;
        if (category) campaign.category = category;
        if (description) campaign.description = description;
        if (shortDescription !== undefined) campaign.shortDescription = shortDescription;
        if (goalAmount) campaign.goalAmount = parseFloat(goalAmount);
        if (endDate) campaign.endDate = new Date(endDate);
        if (location !== undefined) campaign.location = location;
        if (beneficiaryInfo !== undefined) campaign.beneficiaryInfo = beneficiaryInfo;
        if (impactDetails !== undefined) campaign.impactDetails = impactDetails;
        if (address) {
            campaign.address = typeof address === "string" ? JSON.parse(address) : address;
        }
        if (isFeatured !== undefined && req.user.role === "admin") {
            campaign.isFeatured = isFeatured === "true";
        }

        // Update images if provided
        if (req.files?.coverImage) {
            // Delete old cover image
            if (campaign.coverImage) {
                deleteFile(campaign.coverImage);
            }
            campaign.coverImage = req.files.coverImage[0].path;
        }

        if (req.files?.campaignImages) {
            // Delete old images
            campaign.campaignImages.forEach(img => deleteFile(img));
            campaign.campaignImages = req.files.campaignImages.map(f => f.path);
        }

        // Reset status to pending if major changes
        if (campaign.status === "active" || campaign.status === "paused") {
            campaign.status = "pending";
            campaign.approvalStatus = "pending";
            campaign.isActive = false;
        }

        await campaign.save();

        res.status(200).json({
            success: true,
            message: "Campaign updated successfully",
            data: campaign
        });

    } catch (error) {
        console.error("Update campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update campaign",
            error: error.message
        });
    }
};

// ==================== DELETE CAMPAIGN ====================

/**
 * @route DELETE /api/campaigns/:id
 * @desc Delete campaign (soft delete)
 * @access Private (Charity owner or Admin)
 */
exports.deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Check authorization
        const user = await User.findById(req.userId);
        const isAdmin = user?.role === "admin";
        const isOwner = campaign.charityId.toString() === req.userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this campaign"
            });
        }

        // Soft delete
        campaign.isDeleted = true;
        campaign.deletedAt = new Date();
        campaign.status = "cancelled";
        campaign.isActive = false;
        await campaign.save();

        res.status(200).json({
            success: true,
            message: "Campaign deleted successfully"
        });

    } catch (error) {
        console.error("Delete campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete campaign",
            error: error.message
        });
    }
};

// ==================== GET CHARITY CAMPAIGNS ====================

/**
 * @route GET /api/campaigns/charity/:charityId
 * @desc Get all campaigns for a specific charity
 * @access Public
 */
exports.getCharityCampaigns = async (req, res) => {
    try {
        const { charityId } = req.params;
        const { status, page = 1, limit = 10 } = req.query;

        if (!mongoose.Types.ObjectId.isValid(charityId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const query = {
            charityId,
            isDeleted: false
        };

        if (status && status !== "all") {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [campaigns, total] = await Promise.all([
            Campaign.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 })
                .populate("charityId", "fullName email profileImage charityDetails.organizationName"),
            Campaign.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: campaigns,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error("Get charity campaigns error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch charity campaigns",
            error: error.message
        });
    }
};

// ==================== ADMIN APPROVE CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/approve
 * @desc Admin approve campaign
 * @access Private (Admin only)
 */
exports.approveCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        // Check if user is admin
        const user = await User.findById(req.userId);
        if (!user || user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Only admins can approve campaigns"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        campaign.approvalStatus = "approved";
        campaign.status = "active";
        campaign.isActive = true;
        campaign.approvedBy = req.userId;
        campaign.approvedAt = new Date();
        if (adminNote) campaign.adminNote = adminNote;

        await campaign.save();

        // Send notification email to charity
        const charity = await User.findById(campaign.charityId);
        if (charity && charity.email) {
            await sendEmail({
                to: charity.email,
                subject: `Campaign "${campaign.title}" Approved! 🎉`,
                html: `
                    <h2>Campaign Approved!</h2>
                    <p>Dear ${charity.fullName},</p>
                    <p>Your campaign "<strong>${campaign.title}</strong>" has been approved and is now live!</p>
                    <p>You can start receiving donations immediately.</p>
                    <p>Share your campaign link with your network:</p>
                    <p><a href="${process.env.FRONTEND_URL}/campaigns/${campaign._id}">${process.env.FRONTEND_URL}/campaigns/${campaign._id}</a></p>
                    <p>Best of luck with your campaign! 🚀</p>
                `
            });
        }

        res.status(200).json({
            success: true,
            message: "Campaign approved successfully",
            data: campaign
        });

    } catch (error) {
        console.error("Approve campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve campaign",
            error: error.message
        });
    }
};

// ==================== ADMIN REJECT CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/reject
 * @desc Admin reject campaign
 * @access Private (Admin only)
 */
exports.rejectCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required"
            });
        }

        // Check if user is admin
        const user = await User.findById(req.userId);
        if (!user || user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Only admins can reject campaigns"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        campaign.approvalStatus = "rejected";
        campaign.status = "draft";
        campaign.isActive = false;
        campaign.rejectionReason = rejectionReason;
        campaign.adminNote = rejectionReason;

        await campaign.save();

        // Send notification email to charity
        const charity = await User.findById(campaign.charityId);
        if (charity && charity.email) {
            await sendEmail({
                to: charity.email,
                subject: `Campaign "${campaign.title}" Update`,
                html: `
                    <h2>Campaign Update</h2>
                    <p>Dear ${charity.fullName},</p>
                    <p>Your campaign "<strong>${campaign.title}</strong>" was not approved.</p>
                    <p><strong>Reason:</strong> ${rejectionReason}</p>
                    <p>Please make the necessary changes and resubmit for approval.</p>
                    <p><a href="${process.env.FRONTEND_URL}/charity/campaigns/${campaign._id}/edit">Edit Campaign</a></p>
                `
            });
        }

        res.status(200).json({
            success: true,
            message: "Campaign rejected",
            data: campaign
        });

    } catch (error) {
        console.error("Reject campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reject campaign",
            error: error.message
        });
    }
};

// ==================== PAUSE CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/pause
 * @desc Pause active campaign
 * @access Private (Charity owner or Admin)
 */
exports.pauseCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Check authorization
        const user = await User.findById(req.userId);
        const isAdmin = user?.role === "admin";
        const isOwner = campaign.charityId.toString() === req.userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to pause this campaign"
            });
        }

        if (campaign.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Only active campaigns can be paused"
            });
        }

        campaign.status = "paused";
        campaign.isActive = false;
        await campaign.save();

        res.status(200).json({
            success: true,
            message: "Campaign paused successfully",
            data: campaign
        });

    } catch (error) {
        console.error("Pause campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to pause campaign",
            error: error.message
        });
    }
};

// ==================== RESUME CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/resume
 * @desc Resume paused campaign
 * @access Private (Charity owner or Admin)
 */
exports.resumeCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Check authorization
        const user = await User.findById(req.userId);
        const isAdmin = user?.role === "admin";
        const isOwner = campaign.charityId.toString() === req.userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to resume this campaign"
            });
        }

        if (campaign.status !== "paused") {
            return res.status(400).json({
                success: false,
                message: "Only paused campaigns can be resumed"
            });
        }

        campaign.status = "active";
        campaign.isActive = true;
        await campaign.save();

        res.status(200).json({
            success: true,
            message: "Campaign resumed successfully",
            data: campaign
        });

    } catch (error) {
        console.error("Resume campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to resume campaign",
            error: error.message
        });
    }
};

// ==================== GET CAMPAIGN STATS ====================

/**
 * @route GET /api/campaigns/stats/charity/:charityId
 * @desc Get campaign statistics for a charity
 * @access Private (Charity owner or Admin)
 */
exports.getCampaignStats = async (req, res) => {
    try {
        const { charityId } = req.params;

        // Check authorization
        const user = await User.findById(req.userId);
        const isAdmin = user?.role === "admin";
        const isOwner = charityId === req.userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view these stats"
            });
        }

        const stats = await Campaign.getCharityStats(new mongoose.Types.ObjectId(charityId));

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error("Get campaign stats error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaign stats",
            error: error.message
        });
    }
};


exports.getCampaignForDonation =  async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findById(id)
      .populate('charityId', 'fullName email profileImage phone charityDetails.organizationName charityDetails.verified charityDetails.missionStatement charityDetails.socialMedia')
      .select('title description goalAmount raisedAmount stats coverImage endDate category location charityId status isActive isVerified __v');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    // Check if campaign is active
    const isActive = campaign.status === 'active' && campaign.isActive;
    const isExpired = new Date() > new Date(campaign.endDate);
    
    // Calculate days remaining
    const daysRemaining = Math.ceil((new Date(campaign.endDate) - new Date()) / (1000 * 60 * 60 * 24));

    // Get recent donations (for display on donation page)
    const recentDonations = await Donation.find({ 
      campaignId: campaign._id, 
      status: 'Completed' 
    })
      .sort({ donationDate: -1 })
      .limit(5)
      .populate('donorId', 'fullName')
      .select('amount donationDate isAnonymous donorId');

    res.status(200).json({
      success: true,
      data: {
        _id: campaign._id,
        title: campaign.title,
        description: campaign.description,
        coverImage: campaign.coverImage,
        category: campaign.category,
        location: campaign.location,
        goalAmount: campaign.goalAmount,
        raisedAmount: campaign.raisedAmount,
        stats: campaign.stats,
        endDate: campaign.endDate,
        status: campaign.status,
        isActive: campaign.isActive,
        isVerified: campaign.isVerified,
        isExpired,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isActive: isActive && !isExpired,
        charityId: {
          _id: campaign.charityId?._id,
          fullName: campaign.charityId?.fullName,
          email: campaign.charityId?.email,
          profileImage: campaign.charityId?.profileImage,
          organizationName: campaign.charityId?.charityDetails?.organizationName,
          verified: campaign.charityId?.charityDetails?.verified,
          missionStatement: campaign.charityId?.charityDetails?.missionStatement,
          socialMedia: campaign.charityId?.charityDetails?.socialMedia,
        },
        recentDonations: recentDonations.map(d => ({
          amount: d.amount,
          donorName: d.isAnonymous ? 'Anonymous' : d.donorId?.fullName || 'Guest',
          date: d.donationDate,
        })),
        __v: campaign.__v || 0,
      },
    });

  } catch (error) {
    console.error('Get donation page error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load donation page',
      error: error.message,
    });
  }
}

// ==================== DONATION LINK ====================

/**
 * @route GET /api/campaigns/donation-link/:donationLink
 * @desc Get campaign by donation link
 * @access Public
 */
exports.getCampaignByDonationLink = async (req, res) => {
    try {
        const { donationLink } = req.params;

        const campaign = await Campaign.findOne({ 
            donationLink, 
            isDeleted: false,
            isActive: true,
            approvalStatus: "approved"
        }).populate("charityId", "fullName email profileImage charityDetails.organizationName");

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        res.status(200).json({
            success: true,
            data: campaign
        });

    } catch (error) {
        console.error("Get campaign by donation link error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaign",
            error: error.message
        });
    }
};
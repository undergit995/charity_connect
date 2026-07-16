const mongoose = require("mongoose");
const Campaign = require("../../models/CampaignModel");
const Donation = require("../../models/Donation");
const User = require("../../models/User");
const ActivityLog = require("../../models/ActivityLog");
const { sendEmail } = require("../../utils/emailService");
const { formatDistanceToNow } = require("date-fns");

exports.getCharityCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status = "all" } = req.query;
    const user = await User.findById(req.userId);
    if (!user || user.role !== "charity") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Access denied. Only charities can access this endpoint.",
        });
    }

    const query = { charityId: req.userId, isDeleted: false };
    if (status && status !== "all") query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 })
        .select("+__v"),
      Campaign.countDocuments(query),
    ]);

    const stats = await Campaign.aggregate([
      { $match: { charityId: req.userId, isDeleted: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          paused: { $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] } },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]);

    const version = await Campaign.findOne({ charityId: req.userId })
      .sort({ updatedAt: -1 })
      .select("__v");

    res.status(200).json({
      success: true,
      campaigns,
      stats: stats[0] || {
        total: 0,
        active: 0,
        draft: 0,
        pending: 0,
        paused: 0,
        completed: 0,
      },
      version: version?.__v || 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get charity campaigns error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch campaigns",
        error: error.message,
      });
  }
};

exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid campaign ID" });
    }
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    }).select("+__v");
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    console.error("Get charity campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch campaign",
        error: error.message,
      });
  }
};

exports.submitCampaignForReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid campaign ID" });
    }
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    if (campaign.__v !== parseInt(version)) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Version conflict detected. Please refresh and try again.",
          current: campaign,
          updates: req.body,
        });
    }
    if (campaign.status !== "draft") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only draft campaigns can be submitted for review",
        });
    }
    campaign.status = "pending";
    campaign.approvalStatus = "pending";
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;
    await campaign.save();

    const admins = await User.find({ role: "admin" });
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `New Campaign Pending Approval: ${campaign.title}`,
        html: `<p>New campaign "${campaign.title}" submitted for review. <a href="${process.env.FRONTEND_URL}/admin/campaigns/${campaign._id}">Review Now</a></p>`,
      });
    }
    res
      .status(200)
      .json({
        success: true,
        message: "Campaign submitted for review successfully",
        data: campaign,
      });
  } catch (error) {
    console.error("Submit campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to submit campaign",
        error: error.message,
      });
  }
};

exports.pauseCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    if (campaign.status !== "active") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only active campaigns can be paused",
        });
    }
    campaign.status = "paused";
    campaign.isActive = false;
    await campaign.save();
    res
      .status(200)
      .json({
        success: true,
        message: "Campaign paused successfully",
        data: campaign,
      });
  } catch (error) {
    console.error("Pause campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to pause campaign",
        error: error.message,
      });
  }
};

exports.resumeCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    if (campaign.status !== "paused") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only paused campaigns can be resumed",
        });
    }
    campaign.status = "active";
    campaign.isActive = true;
    await campaign.save();
    res
      .status(200)
      .json({
        success: true,
        message: "Campaign resumed successfully",
        data: campaign,
      });
  } catch (error) {
    console.error("Resume campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to resume campaign",
        error: error.message,
      });
  }
};

exports.completeCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    if (!["active", "paused"].includes(campaign.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only active or paused campaigns can be marked as completed",
        });
    }
    campaign.status = "completed";
    campaign.isActive = false;
    await campaign.save();

    const donations = await Donation.find({ campaignId: id })
      .populate("donorId", "email fullName")
      .limit(100);
    for (const donation of donations) {
      if (donation.donorId?.email) {
        await sendEmail({
          to: donation.donorId.email,
          subject: `Campaign "${campaign.title}" Completed! 🎉`,
          html: `<p>Dear ${donation.donorId.fullName || "Donor"}, the campaign "${campaign.title}" has been successfully completed! Thank you for your support.</p>`,
        });
      }
    }
    res
      .status(200)
      .json({
        success: true,
        message: "Campaign completed successfully",
        data: campaign,
      });
  } catch (error) {
    console.error("Complete campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to complete campaign",
        error: error.message,
      });
  }
};

exports.cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    if (campaign.status !== "pending") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only pending campaigns can be cancelled",
        });
    }
    campaign.status = "draft";
    await campaign.save();
    res
      .status(200)
      .json({
        success: true,
        message: "Pending request cancelled successfully",
        data: campaign,
      });
  } catch (error) {
    console.error("Cancel request error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to cancel request",
        error: error.message,
      });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Campaign not found or you do not have access",
        });
    }
    if (!["draft", "pending", "cancelled"].includes(campaign.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only draft, pending, or cancelled campaigns can be deleted",
        });
    }
    campaign.isDeleted = true;
    campaign.deletedAt = new Date();
    campaign.status = "cancelled";
    campaign.isActive = false;
    await campaign.save();
    res
      .status(200)
      .json({
        success: true,
        message: "Campaign deleted successfully",
        data: campaign,
      });
  } catch (error) {
    console.error("Delete campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete campaign",
        error: error.message,
      });
  }
};

exports.getCampaignStats = async (req, res) => {
  try {
    const stats = await Campaign.aggregate([
      { $match: { charityId: req.userId, isDeleted: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          paused: { $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] } },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          totalRaised: { $sum: "$raisedAmount" },
          totalDonors: { $sum: "$stats.donorCount" },
        },
      },
    ]);
    res.status(200).json({ success: true, data: stats[0] || {} });
  } catch (error) {
    console.error("Get campaign stats error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch campaign stats",
        error: error.message,
      });
  }
};

exports.resolveConflict = async (req, res) => {
  try {
    const { documentId, strategy, userChanges } = req.body;
    if (!documentId || !strategy) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Document ID and strategy are required",
        });
    }
    const campaign = await Campaign.findOne({
      _id: documentId,
      charityId: req.userId,
    });
    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found" });
    }

    let resolvedData;
    switch (strategy) {
      case "merge":
        resolvedData = { ...campaign.toObject(), ...userChanges };
        break;
      case "latest":
      default:
        resolvedData = campaign;
        break;
    }

    const updated = await Campaign.findByIdAndUpdate(
      documentId,
      {
        ...resolvedData,
        __v: campaign.__v + 1,
        lastModifiedAt: new Date(),
        lastModifiedBy: req.userId,
      },
      { new: true },
    );
    res
      .status(200)
      .json({
        success: true,
        message: "Conflict resolved successfully",
        data: updated,
      });
  } catch (error) {
    console.error("Resolve conflict error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to resolve conflict",
        error: error.message,
      });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const charityId = req.userId;

    const now = new Date();
    let startDate;
    switch (period) {
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
    const endDate = new Date();

    const [
      campaignStats,
      donationStats,
      donationTrend,
      categoryDistribution,
      monthlyDonations,
      recentActivity,
      previousPeriod,
    ] = await Promise.all([
      Campaign.aggregate([
        { $match: { charityId, isDeleted: false } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            paused: { $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] } },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            totalRaised: { $sum: "$raisedAmount" },
          },
        },
      ]),
      Donation.aggregate([
        { $match: { charityId, status: "Completed" } },
        {
          $group: {
            _id: null,
            totalDonors: { $addToSet: "$donorId" },
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Donation.aggregate([
        {
          $match: {
            charityId,
            status: "Completed",
            donationDate: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dayOfMonth: "$donationDate" },
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Campaign.aggregate([
        { $match: { charityId, isDeleted: false } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Donation.aggregate([
        {
          $match: {
            charityId,
            status: "Completed",
            donationDate: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $month: "$donationDate" },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ActivityLog.find({ userId: charityId }).sort({ timestamp: -1 }).limit(10),
      Donation.aggregate([
        {
          $match: {
            charityId,
            status: "Completed",
            donationDate: { $lt: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const currentTotal = donationStats[0]?.totalAmount || 0;
    const previousTotal = previousPeriod[0]?.total || 0;
    const growth =
      previousTotal > 0
        ? ((currentTotal - previousTotal) / previousTotal) * 100
        : 0;

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalRaised: campaignStats[0]?.totalRaised || 0,
          totalDonors: donationStats[0]?.totalDonors?.length || 0,
          growth: Math.round(growth),
        },
        campaignStatus: {
          total: campaignStats[0]?.total || 0,
          active: campaignStats[0]?.active || 0,
          draft: campaignStats[0]?.draft || 0,
          pending: campaignStats[0]?.pending || 0,
          paused: campaignStats[0]?.paused || 0,
          completed: campaignStats[0]?.completed || 0,
        },
        charts: {
          donationTrend: {
            labels: donationTrend.map((item) => `${item._id}`),
            amounts: donationTrend.map((item) => item.amount),
            counts: donationTrend.map((item) => item.count),
          },
          categoryDistribution: {
            labels: categoryDistribution.map((item) => item._id),
            counts: categoryDistribution.map((item) => item.count),
          },
          monthlyDonations: {
            labels: monthlyDonations.map((item) =>
              new Date(2024, item._id - 1, 1).toLocaleDateString("en-US", {
                month: "short",
              }),
            ),
            amounts: monthlyDonations.map((item) => item.amount),
          },
        },
        recentActivity: recentActivity.map((activity) => {
          const activityDate = activity.createdAt
            ? new Date(activity.createdAt ?? activity.timestamp)
            : null;
          const isValidDate = activityDate && !isNaN(activityDate.getTime());

          return {
            message: activity.action,
            time: isValidDate
              ? formatDistanceToNow(activityDate, { addSuffix: true })
              : "recently",
            type: activity.type || "general",
            status: activity.status || "Completed",
          };
        }),
      },
    });
  } catch (error) {
    console.error("Charity dashboard stats error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch dashboard stats",
        error: error.message,
      });
  }
};

/**
 * @route GET /api/charity/profile
 * @desc Get charity profile
 * @access Private (Charity only)
 */
exports.getProfile = async (req, res) => {
  try {
    const charity = await User.findById(req.userId)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean();

    if (!charity || charity.role !== 'charity') {
      return res.status(404).json({ success: false, message: 'Charity not found' });
    }

    const campaignSummary = await Campaign.aggregate([
      { $match: { charityId: req.userId, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          totalRaised: { $sum: '$raisedAmount' },
          totalDonors: { $sum: '$stats.donorCount' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        charity,
        campaignSummary: campaignSummary[0] || {},
      },
    });
  } catch (error) {
    console.error('Get charity profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch charity profile',
      error: error.message,
    });
  }
};

/**
 * @route PUT /api/charity/profile
 * @desc Update charity profile
 * @access Private (Charity only)
 */
exports.updateProfile = async (req, res) => {
  try {
    const charity = await User.findById(req.userId);
    if (!charity || charity.role !== 'charity') {
      return res.status(404).json({ success: false, message: 'Charity not found' });
    }

    const {
      firstName,
      lastName,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      bio,
      charityDetails,
    } = req.body;

    if (firstName) charity.firstName = firstName;
    if (lastName) charity.lastName = lastName;
    if (firstName || lastName) charity.fullName = `${charity.firstName} ${charity.lastName}`;
    if (phone) charity.phone = phone;
    if (address) charity.address.street = address;
    if (city) charity.address.city = city;
    if (state) charity.address.state = state;
    if (country) charity.address.country = country;
    if (zipCode) charity.address.zipCode = zipCode;
    if (bio) charity.bio = bio;

    if (charityDetails) {
      charity.charityDetails = { ...charity.charityDetails, ...charityDetails };
    }

    await charity.save();
    const updatedCharity = charity.toObject();
    delete updatedCharity.password;

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedCharity },
    });
  } catch (error) {
    console.error('Update charity profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
};

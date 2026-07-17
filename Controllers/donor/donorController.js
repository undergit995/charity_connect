const mongoose = require("mongoose");
const Donation = require("../../models/Donation.js");
const { getFileUrl } = require("../../config/multerConfig.js");
const otpService = require("../../utils/otpService.js");
const Campaign = require("../../models/CampaignModel");
const User = require("../../models/User");

exports.getDashboardStats = async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const donorId = req.userId;

    const user = await User.findById(donorId);
    if (!user) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied. Donor only." });
    }

    const now = new Date();
    let startDate, previousStartDate;
    switch (period) {
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
    }
    const endDate = new Date();

    const [
      totalDonations,
      totalAmount,
      avgDonation,
      donationHistory,
      categoryDistribution,
      impactData,
      recentDonations,
      savedCampaigns,
      previousPeriodTotal,
    ] = await Promise.all([
      Donation.countDocuments({ donorId, status: "Completed" }),
      Donation.aggregate([
        { $match: { donorId, status: "Completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Donation.aggregate([
        { $match: { donorId, status: "Completed" } },
        { $group: { _id: null, avg: { $avg: "$amount" } } },
      ]),
      Donation.aggregate([
        {
          $match: {
            donorId,
            status: "Completed",
            donationDate: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$donationDate" },
              month: { $month: "$donationDate" },
              day: { $dayOfMonth: "$donationDate" },
            },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),
      Donation.aggregate([
        { $match: { donorId, status: "Completed" } },
        {
          $lookup: {
            from: "campaigns",
            localField: "campaignId",
            foreignField: "_id",
            as: "campaign",
          },
        },
        { $unwind: "$campaign" },
        {
          $group: {
            _id: "$campaign.category",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Donation.aggregate([
        { $match: { donorId, status: "Completed" } },
        {
          $lookup: {
            from: "campaigns",
            localField: "campaignId",
            foreignField: "_id",
            as: "campaign",
          },
        },
        { $unwind: "$campaign" },
        {
          $group: {
            _id: "$campaign.title",
            totalDonated: { $sum: "$amount" },
            campaignId: { $first: "$campaignId" },
          },
        },
        { $sort: { totalDonated: -1 } },
        { $limit: 5 },
      ]),
      Donation.find({ donorId, status: "Completed" })
        .sort({ donationDate: -1 })
        .limit(5)
        .populate("campaignId", "title coverImage")
        .lean(),
      User.findById(donorId)
        .select("savedCampaigns")
        .populate(
          "savedCampaigns",
          "title coverImage goalAmount raisedAmount category stats endDate",
        )
        .lean(),
      Donation.aggregate([
        {
          $match: {
            donorId,
            status: "Completed",
            donationDate: { $gte: previousStartDate, $lt: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const currentTotal = totalAmount[0]?.total || 0;
    const previousTotal = previousPeriodTotal[0]?.total || 0;
    const growth =
      previousTotal > 0
        ? ((currentTotal - previousTotal) / previousTotal) * 100
        : 0;
    const impactScore = Math.min(
      Math.floor(currentTotal / 100 + totalDonations * 2),
      100,
    );

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalDonations,
          totalAmount: currentTotal,
          averageDonation: avgDonation[0]?.avg || 0,
          savedCampaigns: savedCampaigns?.savedCampaigns?.length || 0,
          impactScore,
          growth: Math.round(growth),
        },
        charts: {
          donationHistory: {
            labels: donationHistory.map((i) =>
              new Date(
                i._id.year,
                i._id.month - 1,
                i._id.day,
              ).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            ),
            amounts: donationHistory.map((i) => i.amount),
          },
          categoryDistribution: {
            labels: categoryDistribution.map((i) => i._id || "Other"),
            counts: categoryDistribution.map((i) => i.count),
          },
          impactData: impactData.map((i) => ({
            campaignTitle: i._id,
            totalDonated: i.totalDonated,
          })),
        },
        recentDonations: recentDonations,
        savedCampaigns: savedCampaigns?.savedCampaigns || [],
      },
    });
  } catch (error) {
    //console.error("Donor dashboard stats error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch dashboard stats",
        error: error.message,
      });
  }
};

exports.getDonations = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "all", search, sort } = req.query;
    const query = { donorId: req.userId };
    if (status !== "all") query.status = status;

    if (search) {
      const campaigns = await Campaign.find({
        title: { $regex: search, $options: 'i' },
      }).select('_id');
      const campaignIds = campaigns.map(c => c._id);

      query.$or = [
        { receiptNumber: { $regex: search, $options: 'i' } },
        { campaignId: { $in: campaignIds } },
      ];
    }

    let sortOption = { donationDate: -1 };
    if (sort === 'asc') {
      sortOption = { donationDate: 1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [donations, total] = await Promise.all([
      Donation.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("campaignId", "title coverImage category")
        .populate("charityId", "fullName charityDetails.organizationName")
        .lean(),
      Donation.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      donations: donations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    //console.error("Get donor donations error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch donations",
        error: error.message,
      });
  }
};

exports.getDonationReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid donation ID" });
    }
    const donation = await Donation.findOne({ _id: id, donorId: req.userId })
      .populate("campaignId", "title")
      .populate("charityId", "fullName charityDetails.organizationName")
      .lean();
    if (!donation) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Donation not found or you do not have access",
        });
    }
    res.status(200).json({ success: true, data: donation });
  } catch (error) {
    //console.error("Get donation receipt error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch receipt",
        error: error.message,
      });
  }
};

exports.getSavedCampaigns = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate({
        path: "savedCampaigns",
        match: { isDeleted: false },
        populate: {
          path: "charityId",
          select:
            "fullName charityDetails.organizationName charityDetails.verified",
        },
      })
      .lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user.savedCampaigns || [] });
  } catch (error) {
    //console.error("Get saved campaigns error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch saved campaigns",
        error: error.message,
      });
  }
};

exports.toggleSaveCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { action } = req.body; // 'save' or 'unsave'
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid campaign ID" });
    }
    const user = await User.findById(req.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found" });
    }

    if (action === "save") {
      if (!user.savedCampaigns.includes(campaignId)) {
        user.savedCampaigns.push(campaignId);
        campaign.stats.saves = (campaign.stats.saves || 0) + 1;
      }
    } else if (action === "unsave") {
      user.savedCampaigns = user.savedCampaigns.filter(
        (id) => id.toString() !== campaignId,
      );
      campaign.stats.saves = Math.max(0, (campaign.stats.saves || 0) - 1);
    } else {
      return res
        .status(400)
        .json({
          success: false,
          message: 'Invalid action. Use "save" or "unsave"',
        });
    }

    await Promise.all([user.save(), campaign.save()]);

    res.status(200).json({
      success: true,
      message: `Campaign ${action}d`,
      data: {
        saved: action === "save",
        savedCount: user.savedCampaigns.length,
      },
    });
  } catch (error) {
    //console.error("Save campaign error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to save campaign",
        error: error.message,
      });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const donor = await User.findById(req.userId)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .lean();
    if (!donor) {
      return res
        .status(404)
        .json({ success: false, message: "Donor not found" });
    }
    const donationSummary = await Donation.aggregate([
      { $match: { donorId: req.userId, status: "Completed" } },
      {
        $group: {
          _id: null,
          totalDonations: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          avgAmount: { $avg: "$amount" },
          maxAmount: { $max: "$amount" },
          minAmount: { $min: "$amount" },
        },
      },
    ]);
    res.status(200).json({
      success: true,
      data: { donor, donationSummary: donationSummary[0] || {} },
    });
  } catch (error) {
    //console.error("Get donor profile error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch donor profile",
        error: error.message,
      });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const donor = await User.findById(req.userId);
    if (!donor) {
      return res
        .status(404)
        .json({ success: false, message: "Donor not found" });
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
      donorPreferences,
      notificationPreferences,
      email,
      emailChangeToken,
    } = req.body;
    if (firstName) donor.firstName = firstName;
    if (lastName) donor.lastName = lastName;
    if (firstName || lastName)
      donor.fullName = `${donor.firstName} ${donor.lastName}`;
    if (phone) donor.phone = phone;

    // Ensure address object exists before setting properties
    if (!donor.address) {
      donor.address = {};
    }

    if (address) donor.address.street = address;
    if (city) donor.address.city = city;
    if (state) donor.address.state = state;
    if (country) donor.address.country = country;
    if (zipCode) donor.address.zipCode = zipCode;
    if (bio) donor.bio = bio;
    if (donorPreferences) {
      donor.donorPreferences = typeof donorPreferences === 'string' ? JSON.parse(donorPreferences) : donorPreferences;
    }

    // Handle email change
    if (email && email !== donor.email) {
      if (!emailChangeToken) {
        return res.status(400).json({ success: false, message: 'Email change requires verification token.' });
      }
      const verificationResult = await otpService.verifyOTP(email, emailChangeToken, 'email-change');
      if (!verificationResult.success) {
        return res.status(400).json({ success: false, message: `Email verification failed: ${verificationResult.message}` });
      }
      // Check for email uniqueness before updating
      const existingUser = await User.findOne({ email: email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'This email address is already in use.' });
      }
      donor.email = email;
    }
    if (notificationPreferences) {
      donor.notificationPreferences = typeof notificationPreferences === 'string' ? JSON.parse(notificationPreferences) : notificationPreferences;
    }

    if (req.file) {
      donor.profileImage = getFileUrl(req, req.file.path);
    }

    await donor.save();
    
    const updatedDonor = donor.toObject();
    delete updatedDonor.password;

    res
      .status(200)
      .json({
        success: true,
        message: "Profile updated successfully",
        data: { user: updatedDonor },
      });
  } catch (error) {
    console.log("Update donor profile error:", error.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update profile",
        error: error.message,
      });
  }
};

exports.getImpact = async (req, res) => {
  try {
    const impactData = await Donation.aggregate([
      { $match: { donorId: req.userId, status: "Completed" } },
      {
        $lookup: {
          from: "campaigns",
          localField: "campaignId",
          foreignField: "_id",
          as: "campaign",
        },
      },
      { $unwind: "$campaign" },
      {
        $group: {
          _id: null,
          totalDonations: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          uniqueCampaigns: { $addToSet: "$campaignId" },
          categories: { $addToSet: "$campaign.category" },
          campaigns: {
            $push: {
              title: "$campaign.title",
              amount: "$amount",
              category: "$campaign.category",
            },
          },
        },
      },
    ]);

    const impact = impactData[0] || {
      totalDonations: 0,
      totalAmount: 0,
      uniqueCampaigns: [],
      categories: [],
      campaigns: [],
    };

    res.status(200).json({
      success: true,
      data: {
        totalDonations: impact.totalDonations,
        totalAmount: impact.totalAmount,
        uniqueCampaigns: impact.uniqueCampaigns.length,
        uniqueCategories: impact.categories.length,
        categories: impact.categories,
        campaigns: impact.campaigns,
      },
    });
  } catch (error) {
    //console.error("Get donor impact error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch impact data",
        error: error.message,
      });
  }
};

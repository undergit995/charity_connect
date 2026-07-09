const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Campaign = require('../../models/CampaignModel');
const Donation = require('../../models/Donation');
const User = require('../../models/User');
// const { uploadCampaignImages, deleteFile } = require('../../middlewares/uploadMiddleware');
const { sendEmail } = require('../../utils/emailService');
const { authMiddleware } = require('../../middlewares/auth');

// ==================== CHARITY CAMPAIGN ROUTES ====================

/**
 * @route GET /api/charity/campaigns
 * @desc Get all campaigns for the logged-in charity
 * @access Private (Charity only)
 */
router.get('/campaigns', authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = 'all',
    } = req.query;

    // Verify user is a charity
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'charity') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only charities can access this endpoint.',
      });
    }

    const query = {
      charityId: req.userId,
      isDeleted: false,
    };

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get campaigns with version for optimistic locking
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 })
        .select('+__v'),
      Campaign.countDocuments(query),
    ]);

    // Get campaign statistics
    const stats = await Campaign.aggregate([
      { $match: { charityId: req.userId, isDeleted: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          draft: {
            $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          paused: {
            $sum: { $cond: [{ $eq: ['$status', 'paused'] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
        },
      },
    ]);

    // Get version for optimistic locking
    const version = await Campaign.findOne({ charityId: req.userId })
      .sort({ updatedAt: -1 })
      .select('__v');

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
    console.error('Get charity campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/charity/campaigns/:id
 * @desc Get single campaign for charity
 * @access Private (Charity owner)
 */
router.get('/campaigns/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    }).select('+__v');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });

  } catch (error) {
    console.error('Get charity campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/charity/campaigns/:id/submit
 * @desc Submit campaign for review
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    // Check version for optimistic locking
    if (campaign.__v !== parseInt(version)) {
      return res.status(409).json({
        success: false,
        message: 'Version conflict detected. Please refresh and try again.',
        current: campaign,
        updates: req.body,
      });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft campaigns can be submitted for review',
      });
    }

    campaign.status = 'pending';
    campaign.approvalStatus = 'pending';
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;

    await campaign.save();

    // Notify admin
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `New Campaign Pending Approval: ${campaign.title}`,
        html: `
          <h2>New Campaign Submitted for Review</h2>
          <p><strong>Campaign:</strong> ${campaign.title}</p>
          <p><strong>Charity:</strong> ${campaign.charityId?.fullName || 'Unknown'}</p>
          <p><strong>Goal:</strong> $${campaign.goalAmount}</p>
          <p><a href="${process.env.FRONTEND_URL}/admin/campaigns/${campaign._id}">Review Campaign</a></p>
        `,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Campaign submitted for review successfully',
      data: campaign,
    });

  } catch (error) {
    console.error('Submit campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit campaign',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/charity/campaigns/:id/pause
 * @desc Pause campaign
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/pause', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    // Check version for optimistic locking
    if (campaign.__v !== parseInt(version)) {
      return res.status(409).json({
        success: false,
        message: 'Version conflict detected. Please refresh and try again.',
        current: campaign,
        updates: req.body,
      });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active campaigns can be paused',
      });
    }

    campaign.status = 'paused';
    campaign.isActive = false;
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign paused successfully',
      data: campaign,
    });

  } catch (error) {
    console.error('Pause campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause campaign',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/charity/campaigns/:id/resume
 * @desc Resume campaign
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/resume', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    // Check version for optimistic locking
    if (campaign.__v !== parseInt(version)) {
      return res.status(409).json({
        success: false,
        message: 'Version conflict detected. Please refresh and try again.',
        current: campaign,
        updates: req.body,
      });
    }

    if (campaign.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: 'Only paused campaigns can be resumed',
      });
    }

    campaign.status = 'active';
    campaign.isActive = true;
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign resumed successfully',
      data: campaign,
    });

  } catch (error) {
    console.error('Resume campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume campaign',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/charity/campaigns/:id/complete
 * @desc Complete campaign
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/complete', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    // Check version for optimistic locking
    if (campaign.__v !== parseInt(version)) {
      return res.status(409).json({
        success: false,
        message: 'Version conflict detected. Please refresh and try again.',
        current: campaign,
        updates: req.body,
      });
    }

    if (campaign.status !== 'active' && campaign.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: 'Only active or paused campaigns can be marked as completed',
      });
    }

    campaign.status = 'completed';
    campaign.isActive = false;
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;

    await campaign.save();

    // Notify donors
    const donations = await Donation.find({ campaignId: id })
      .populate('donorId', 'email fullName')
      .limit(100);

    for (const donation of donations) {
      if (donation.donorId?.email) {
        await sendEmail({
          to: donation.donorId.email,
          subject: `Campaign "${campaign.title}" Completed! 🎉`,
          html: `
            <h2>Campaign Completed Successfully!</h2>
            <p>Dear ${donation.donorId.fullName || 'Donor'},</p>
            <p>The campaign "<strong>${campaign.title}</strong>" has been successfully completed!</p>
            <p><strong>Total Raised:</strong> $${campaign.raisedAmount}</p>
            <p><strong>Total Donors:</strong> ${campaign.stats?.donorCount || 0}</p>
            <p>Thank you for your generous support! 🎉</p>
          `,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Campaign completed successfully',
      data: campaign,
    });

  } catch (error) {
    console.error('Complete campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete campaign',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/charity/campaigns/:id/cancel-request
 * @desc Cancel pending request
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/cancel-request', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    // Check version for optimistic locking
    if (campaign.__v !== parseInt(version)) {
      return res.status(409).json({
        success: false,
        message: 'Version conflict detected. Please refresh and try again.',
        current: campaign,
        updates: req.body,
      });
    }

    if (campaign.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending campaigns can be cancelled',
      });
    }

    campaign.status = 'draft';
    campaign.approvalStatus = 'pending';
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Pending request cancelled successfully',
      data: campaign,
    });

  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel request',
      error: error.message,
    });
  }
});

/**
 * @route DELETE /api/charity/campaigns/:id
 * @desc Delete campaign (soft delete)
 * @access Private (Charity owner)
 */
router.delete('/campaigns/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findOne({
      _id: id,
      charityId: req.userId,
      isDeleted: false,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have access',
      });
    }

    // Check version for optimistic locking
    if (campaign.__v !== parseInt(version)) {
      return res.status(409).json({
        success: false,
        message: 'Version conflict detected. Please refresh and try again.',
        current: campaign,
        updates: req.body,
      });
    }

    // Only allow deletion of draft, pending, or cancelled campaigns
    if (!['draft', 'pending', 'cancelled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only draft, pending, or cancelled campaigns can be deleted',
      });
    }

    campaign.isDeleted = true;
    campaign.deletedAt = new Date();
    campaign.status = 'cancelled';
    campaign.isActive = false;
    campaign.__v += 1;
    campaign.lastModifiedAt = new Date();
    campaign.lastModifiedBy = req.userId;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully',
      data: campaign,
    });

  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete campaign',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/charity/campaigns/stats
 * @desc Get campaign statistics
 * @access Private (Charity)
 */
router.get('/campaigns/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await Campaign.aggregate([
      { $match: { charityId: req.userId, isDeleted: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          draft: {
            $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          paused: {
            $sum: { $cond: [{ $eq: ['$status', 'paused'] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          totalRaised: { $sum: '$raisedAmount' },
          totalDonors: { $sum: '$stats.donorCount' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: stats[0] || {
        total: 0,
        active: 0,
        draft: 0,
        pending: 0,
        paused: 0,
        completed: 0,
        totalRaised: 0,
        totalDonors: 0,
      },
    });

  } catch (error) {
    console.error('Get campaign stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign stats',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/charity/campaigns/resolve-conflict
 * @desc Resolve version conflict
 * @access Private (Charity)
 */
router.post('/campaigns/resolve-conflict', authMiddleware, async (req, res) => {
  try {
    const { documentId, strategy, currentVersion, userChanges } = req.body;

    if (!documentId || !strategy) {
      return res.status(400).json({
        success: false,
        message: 'Document ID and strategy are required',
      });
    }

    const campaign = await Campaign.findOne({
      _id: documentId,
      charityId: req.userId,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    let resolvedData;

    switch (strategy) {
      case 'latest':
        // Use latest version from server
        resolvedData = campaign;
        break;

      case 'merge':
        // Merge user changes with current
        resolvedData = { ...campaign.toObject(), ...userChanges };
        resolvedData.__v = campaign.__v + 1;
        resolvedData.lastModifiedAt = new Date();
        resolvedData.lastModifiedBy = req.userId;
        break;

      case 'auto':
      default:
        // Auto-resolve: keep latest version
        resolvedData = campaign;
        break;
    }

    // Update campaign with resolved data
    const updated = await Campaign.findByIdAndUpdate(
      documentId,
      {
        ...resolvedData,
        __v: campaign.__v + 1,
        lastModifiedAt: new Date(),
        lastModifiedBy: req.userId,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Conflict resolved successfully',
      data: updated,
    });

  } catch (error) {
    console.error('Resolve conflict error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve conflict',
      error: error.message,
    });
  }
});

module.exports = router;
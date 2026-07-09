const mongoose = require('mongoose');
const Campaign = require('../../models/CampaignModel');
const Donation = require('../../models/Donation');
const ActivityLog = require('../../models/ActivityLog');
const { sendEmail } = require('../../utils/emailService');

/**
 * @desc Get all campaigns with filters for admin
 * @route GET /api/admin/campaigns
 * @access Private (Admin only)
 */
exports.getCampaigns = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = 'pending',
            category = '',
        } = req.query;

        const query = { isDeleted: false };

        // Filter by approval status
        if (status === 'pending') {
            query.approvalStatus = 'pending';
        } else if (status === 'approved') {
            query.approvalStatus = 'approved';
            query.status = 'active';
        } else if (status === 'rejected') {
            query.approvalStatus = 'rejected';
        } else if (status === 'all') {
            // Show all
        }

        // Filter by campaign status
        if (status === 'active') {
            query.status = 'active';
            query.isActive = true;
        } else if (status === 'paused') {
            query.status = 'paused';
        } else if (status === 'completed') {
            query.status = 'completed';
        }

        // Filter by category
        if (category && category !== 'all') {
            query.category = category;
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

        const [campaigns, total] = await Promise.all([
            Campaign.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 })
                .populate('charityId', 'fullName email profileImage charityDetails.organizationName')
                .populate('createdBy', 'fullName email'),
            Campaign.countDocuments(query),
        ]);

        // Get stats
        const stats = await Campaign.aggregate([
            { $match: { isDeleted: false } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: {
                        $sum: { $cond: [{ $eq: ['$approvalStatus', 'pending'] }, 1, 0] }
                    },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$approvalStatus', 'approved'] }, 1, 0] }
                    },
                    rejected: {
                        $sum: { $cond: [{ $eq: ['$approvalStatus', 'rejected'] }, 1, 0] }
                    },
                    active: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                }
            }
        ]);

        res.status(200).json({
            success: true,
            campaigns,
            stats: stats[0] || {
                total: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                active: 0,
                completed: 0
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error("Get admin campaigns error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaigns",
            error: error.message
        });
    }
};

/**
 * @desc Get single campaign details for admin
 * @route GET /api/admin/campaigns/:id
 * @access Private (Admin only)
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
            .populate('charityId', 'fullName email profileImage phone address charityDetails')
            .populate('createdBy', 'fullName email')
            .populate('approvedBy', 'fullName email');

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Get donation stats
        const donationStats = await Donation.aggregate([
            { $match: { campaignId: campaign._id, status: 'Completed' } },
            {
                $group: {
                    _id: null,
                    totalDonations: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' },
                    uniqueDonors: { $addToSet: '$donorId' },
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                campaign,
                donationStats: donationStats[0] || {
                    totalDonations: 0,
                    totalAmount: 0,
                    avgAmount: 0,
                    uniqueDonorCount: 0
                }
            }
        });

    } catch (error) {
        console.error("Get admin campaign error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaign",
            error: error.message
        });
    }
};

/**
 * @desc Approve campaign (Admin only)
 * @route PUT /api/admin/campaigns/:id/approve
 * @access Private (Admin only)
 */
exports.approveCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id).populate('charityId');
        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        if (campaign.approvalStatus === 'approved') {
            return res.status(400).json({
                success: false,
                message: "Campaign is already approved"
            });
        }

        campaign.approvalStatus = 'approved';
        campaign.status = 'active';
        campaign.isActive = true;
        campaign.approvedBy = req.userId;
        campaign.approvedAt = new Date();
        if (adminNote) campaign.adminNote = adminNote;
        campaign.__v = (campaign.__v || 0) + 1;

        await campaign.save();

        await ActivityLog.create({
            userId: req.userId,
            action: `Approved campaign: ${campaign.title}`,
            type: "campaign_approval",
            details: { campaignId: campaign._id }
        });

        if (campaign.charityId && campaign.charityId.email) {
            await sendEmail({
                to: campaign.charityId.email,
                subject: `Campaign "${campaign.title}" Approved! 🎉`,
                html: `                    
                    <h2>Campaign Approved!</h2>
                    <p>Dear ${charityId.fullName},</p>
                    <p>Your campaign "<strong>${campaign.title}</strong>" has been approved and is now live!</p>
                    <p>You can start receiving donations immediately.</p>
                    <p>Share your campaign link with your network:</p>
                    <p><a href="${process.env.FRONTEND_URL}/campaigns/${campaign._id}">${process.env.FRONTEND_URL}/campaigns/${campaign._id}</a></p>
                    <p>Best of luck with your campaign! 🚀</p>
                    <p><a href="${process.env.FRONTEND_URL}/campaigns/${campaign._id}">View Campaign</a></p>
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

/**
 * @desc Reject campaign (Admin only)
 * @route PUT /api/admin/campaigns/:id/reject
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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid campaign ID"
            });
        }

        const campaign = await Campaign.findById(id).populate('charityId');
        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        campaign.approvalStatus = 'rejected';
        campaign.status = 'draft';
        campaign.isActive = false;
        campaign.rejectionReason = rejectionReason;
        campaign.adminNote = rejectionReason;
        campaign.__v = (campaign.__v || 0) + 1;

        await campaign.save();

        await ActivityLog.create({
            userId: req.userId,
            action: `Rejected campaign: ${campaign.title}`,
            type: "campaign_rejection",
            details: { campaignId: campaign._id, reason: rejectionReason }
        });

        if (campaign.charityId && campaign.charityId.email) {
            await sendEmail({
                to: campaign.charityId.email,
                subject: `Campaign "${campaign.title}" Update`,
                html: `
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
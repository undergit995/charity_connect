const mongoose = require('mongoose');
const DonationService = require('../../services/donationService.js');
const User = require('../../models/User.js');
const Campaign = require('../../models/CampaignModel.js');
const Donation = require('../../models/Donation.js');
const { sendEmail } = require('../../utils/emailService.js');

/**
 * @desc Process a donation with transaction support
 * @route POST /api/donations
 * @access Private
 */
exports.processDonation = async (req, res) => {
    try {
        const { campaignId, amount, isAnonymous, message, paymentMethod } = req.body;

        if (!campaignId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Campaign ID and amount are required',
            });
        }

        const result = await DonationService.handleDonationWithRetry(
            { campaignId, amount, isAnonymous, message, paymentMethod },
            req.userId
        );

        res.status(200).json({
            success: true,
            message: 'Donation processed successfully',
            data: result,
        });
    } catch (error) {
        //console.error('Donation error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Donation failed',
            error: error.message,
        });
    }
};

/**
 * @desc Queue donation for processing (non-blocking)
 * @route POST /api/donations/queue
 * @access Private
 */
exports.queueDonation = async (req, res) => {
    try {
        const { campaignId, amount, isAnonymous, message, paymentMethod } = req.body;

        if (!campaignId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Campaign ID and amount are required',
            });
        }

        const result = await DonationService.queueDonation(
            { campaignId, amount, isAnonymous, message, paymentMethod },
            req.userId
        );

        res.status(200).json({
            success: true,
            message: 'Donation queued for processing',
            data: result,
        });
    } catch (error) {
        //console.error('Queue donation error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to queue donation',
        });
    }
};

/**
 * @desc Process bulk donations (admin only)
 * @route POST /api/donations/bulk
 * @access Private/Admin
 */
exports.processBulkDonations = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required',
            });
        }

        const { donations } = req.body;
        if (!donations || !Array.isArray(donations) || donations.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid donations array required',
            });
        }

        const results = await DonationService.processBulkDonations(donations);

        res.status(200).json({
            success: true,
            message: `Processed ${donations.length} donations`,
            data: results,
        });
    } catch (error) {
        //console.error('Bulk donation error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Bulk donation failed',
        });
    }
};

/**
 * @desc Get donation statistics for a campaign
 * @route GET /api/donations/campaign/:campaignId
 * @access Public
 */
exports.getCampaignDonationStats = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const stats = await DonationService.getDonationStats(campaignId);
        res.status(200).json({
            success: true,
            data: stats,
        });
    } catch (error) {
        //console.error('Get donation stats error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to get donation stats',
        });
    }
};

/**
 * @desc Get real-time donation status
 * @route GET /api/donations/status/:campaignId
 * @access Public
 */
exports.getRealTimeDonationStatus = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const status = await DonationService.getRealTimeStatus(campaignId);
        res.status(200).json({
            success: true,
            data: status,
        });
    } catch (error) {
        //console.error('Get donation status error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to get donation status',
        });
    }
};

/**
 * @desc Payment gateway webhook handler
 * @route POST /api/donations/webhook
 * @access Public
 */
exports.handleDonationWebhook = async (req, res) => {
    try {
        const { event, data } = req.body;

        if (event === 'payment.success') {
            const result = await DonationService.handleDonationWithRetry(
                {
                    campaignId: data.campaignId,
                    amount: data.amount,
                    isAnonymous: data.isAnonymous || false,
                    message: data.message || '',
                    paymentMethod: data.paymentMethod || 'razorpay',
                },
                data.userId
            );

            return res.status(200).json({
                success: true,
                message: 'Webhook processed',
                data: result,
            });
        }

        res.status(200).json({ success: true, message: 'Webhook received' });
    } catch (error) {
        //console.error('Webhook error:', error);
        res.status(500).json({
            success: false,
            message: 'Webhook processing failed',
        });
    }
};

/**
 * @desc Get campaign details for donation page
 * @route GET /api/donations/campaigns/:id/donate
 * @access Public
 */
exports.getCampaignForDonation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid campaign ID',
            });
        }

        const campaign = await Campaign.findById(id)
            .populate('charityId', 'fullName email profileImage charityDetails.organizationName charityDetails.verified')
            .select('title description goalAmount raisedAmount stats coverImage endDate category charityId status isActive');

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        if (campaign.status !== 'active' || !campaign.isActive) {
            return res.status(400).json({
                success: false,
                message: 'This campaign is not active',
            });
        }

        if (new Date() > new Date(campaign.endDate)) {
            return res.status(400).json({
                success: false,
                message: 'This campaign has expired',
            });
        }

        res.status(200).json({
            success: true,
            data: campaign,
        });

    } catch (error) {
        //console.error('Get donation page error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load donation page',
            error: error.message,
        });
    }
};

/**
 * @desc Get donation receipt
 * @route GET /api/donations/receipt/:id
 * @access Private
 */
exports.getDonationReceipt = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid donation ID' });
        }

        const donation = await Donation.findById(id)
            .populate('campaignId', 'title')
            .populate('charityId', 'fullName charityDetails.organizationName')
            .populate('donorId', 'fullName email');

        if (!donation) {
            return res.status(404).json({ success: false, message: 'Donation not found' });
        }

        const isOwner = donation.donorId?._id.toString() === req.userId;
        const isCharity = donation.charityId?._id.toString() === req.userId;
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isCharity && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        res.status(200).json({
            success: true,
            data: donation,
        });

    } catch (error) {
        //console.error('Get receipt error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch receipt',
            error: error.message,
        });
    }
};
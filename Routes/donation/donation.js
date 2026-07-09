// routes/donationRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, authAndRole } = require('../../middlewares/auth');
const donationController = require('../../Controllers/donation/donationController');
const rateLimit = require('express-rate-limit');


const donationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 donations per minute
  message: {
    success: false,
    message: 'Too many donation requests. Please try later.',
  },
});

/**
 * @route POST /api/donations
 * @desc Process a donation with transaction support
 * @access Private
 */
router.post('/', authMiddleware, donationLimiter, donationController.processDonation);

/**
 * @route POST /api/donations/queue
 * @desc Queue donation for processing (non-blocking)
 * @access Private
 */
router.post('/queue', authMiddleware, donationLimiter, donationController.queueDonation);

/**
 * @route POST /api/donations/bulk
 * @desc Process bulk donations (admin only)
 * @access Private/Admin
 */
router.post('/bulk', authAndRole('admin'), donationController.processBulkDonations);

/**
 * @route GET /api/donations/campaign/:campaignId
 * @desc Get donation statistics for a campaign
 * @access Public
 */
router.get('/campaign/:campaignId', donationController.getCampaignDonationStats);

/**
 * @route GET /api/donations/status/:campaignId
 * @desc Get real-time donation status
 * @access Public
 */
router.get('/status/:campaignId', donationController.getRealTimeDonationStatus);

/**
 * @route POST /api/donations/webhook
 * @desc Payment gateway webhook handler
 * @access Public (with signature verification)
 */
router.post('/webhook', donationController.handleDonationWebhook);

/**
 * @route GET /api/campaigns/:id/donate
 * @desc Get campaign details for donation page
 * @access Public
 */
router.get('/campaigns/:id/donate', donationController.getCampaignForDonation);

/**
 * @route GET /api/donations/receipt/:id
 * @desc Get donation receipt
 * @access Private
 */
router.get('/receipt/:id', authMiddleware, donationController.getDonationReceipt);

module.exports = router;
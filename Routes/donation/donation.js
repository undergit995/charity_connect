const express = require('express');
const router = express.Router();
const { authAndRole } = require('../../middlewares/auth.js');
const donationControllers = require('../../Controllers/donation/donationControllers.js');
const {rateLimit} = require('express-rate-limit');


const donationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
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
router.post('/', donationLimiter, donationControllers.processDonation);

/**
 * @route POST /api/donations/queue
 * @desc Queue donation for processing (non-blocking)
 * @access Private
 */
router.post('/queue',  donationLimiter, donationControllers.queueDonation);

/**
 * @route POST /api/donations/bulk
 * @desc Process bulk donations (admin only)
 * @access Private/Admin
 */
router.post('/bulk', authAndRole('admin'), donationControllers.processBulkDonations);

/**
 * @route GET /api/donations/campaign/:campaignId
 * @desc Get donation statistics for a campaign
 * @access Public
 */
router.get('/campaign/:campaignId', donationControllers.getCampaignDonationStats);

/**
 * @route GET /api/donations/status/:campaignId
 * @desc Get real-time donation status
 * @access Public
 */
router.get('/status/:campaignId', donationControllers.getRealTimeDonationStatus);

/**
 * @route POST /api/donations/webhook
 * @desc Payment gateway webhook handler
 * @access Public (with signature verification)
 */
router.post('/webhook', donationControllers.handleDonationWebhook);

/**
 * @route GET /api/campaigns/:id/donate
 * @desc Get campaign details for donation page
 * @access Public
 */
router.get('/campaigns/:id/donate', donationControllers.getCampaignForDonation);

/**
 * @route GET /api/donations/receipt/:id
 * @desc Get donation receipt
 * @access Private
 */
router.get('/receipt/:id', donationControllers.getDonationReceipt);

module.exports = router;
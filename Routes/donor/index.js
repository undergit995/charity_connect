const express = require('express');
const router = express.Router();
const { authMiddleware,authAndRole   } = require('../../middlewares/auth');
const donorController = require('../../Controllers/donor/donorController');
const { upload } = require('../../config/multerConfig');

/**
 * @route GET /api/donor/dashboard/stats
 * @desc Get donor dashboard statistics
 * @access Private (Donor only)
 */
router.get('/dashboard/stats', authAndRole('donor'), donorController.getDashboardStats);

/**
 * @route GET /api/donor/donations
 * @desc Get all donations for the donor
 * @access Private (Donor only)
 */
router.get('/donations', authAndRole('donor'), donorController.getDonations);

/**
 * @route GET /api/donor/donations/:id/receipt
 * @desc Get donation receipt
 * @access Private (Donor only)
 */
router.get('/donations/:id/receipt', authAndRole('donor'), donorController.getDonationReceipt);

/**
 * @route GET /api/donor/saved-campaigns
 * @desc Get donor's saved campaigns
 * @access Private (Donor only)
 */
router.get('/saved-campaigns', authAndRole('donor'), donorController.getSavedCampaigns);

/**
 * @route POST /api/donor/saved-campaigns/:campaignId
 * @desc Save or unsave a campaign
 * @access Private (Donor only)
 */
router.post('/saved-campaigns/:campaignId', authAndRole('donor'), donorController.toggleSaveCampaign);

/**
 * @route PUT /api/donor/profile
 * @desc Update donor profile
 * @access Private (Donor only)
 */
router.put('/profile', authAndRole('donor'), upload.single('profileImage'), donorController.updateProfile);

/**
 * @route GET /api/donor/impact
 * @desc Get donor's impact summary
 * @access Private (Donor only)
 */
router.get('/impact', authAndRole('donor'), donorController.getImpact);

module.exports = router;
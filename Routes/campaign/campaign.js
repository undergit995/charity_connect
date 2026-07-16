const express = require("express");
const router = express.Router();
const { authAndRole, authMiddleware } = require("../../middlewares/auth");
const { uploadCampaignMedia } = require("../../config/multerConfig");
const campaignController = require("../../Controllers/campaign/campaignController");

// ==================== CREATE CAMPAIGN ====================

/**
 * @route POST /api/campaigns
 * @desc Create a new campaign
 * @access Private (Charity)
 */
router.post("/", authAndRole('charity'), uploadCampaignMedia, campaignController.createCampaign);

// ==================== GET ALL CAMPAIGNS ====================

/**
 * @route GET /api/campaigns
 * @desc Get all campaigns with filters
 * @access Public
 */
router.get("/", campaignController.getAllCampaigns);

// ==================== GET SINGLE CAMPAIGN ====================

/**
 * @route GET /api/campaigns/:id
 * @desc Get campaign by ID
 * @access Public
 */
router.get("/:id", campaignController.getCampaignById);

// ==================== GET CAMPAIGN BY SLUG ====================

/**
 * @route GET /api/campaigns/slug/:slug
 * @desc Get campaign by slug
 * @access Public
 */
router.get("/slug/:slug", campaignController.getCampaignBySlug);

// ==================== UPDATE CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id
 * @desc Update campaign
 * @access Private (Charity owner only)
 */
router.put("/:id", authAndRole('charity'), uploadCampaignMedia, campaignController.updateCampaign);

// ==================== DELETE CAMPAIGN ====================

/**
 * @route DELETE /api/campaigns/:id
 * @desc Delete campaign (soft delete)
 * @access Private (Charity owner or Admin)
 */
router.delete("/:id", authAndRole('charity', 'admin'), campaignController.deleteCampaign);

// ==================== GET CHARITY CAMPAIGNS ====================

/**
 * @route GET /api/campaigns/charity/:charityId
 * @desc Get all campaigns for a specific charity
 * @access Public
 */
router.get("/charity/:charityId", campaignController.getCharityCampaigns);

// ==================== ADMIN APPROVE CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/approve
 * @desc Admin approve campaign
 * @access Private (Admin only)
 */
router.put("/:id/approve", authAndRole('admin'), campaignController.approveCampaign);

// ==================== ADMIN REJECT CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/reject
 * @desc Admin reject campaign
 * @access Private (Admin only)
 */
router.put("/:id/reject", authAndRole('admin'), campaignController.rejectCampaign);

// ==================== PAUSE CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/pause
 * @desc Pause active campaign
 * @access Private (Charity owner or Admin)
 */
router.put("/:id/pause", authAndRole('charity', 'admin'), campaignController.pauseCampaign);

// ==================== RESUME CAMPAIGN ====================

/**
 * @route PUT /api/campaigns/:id/resume
 * @desc Resume paused campaign
 * @access Private (Charity owner or Admin)
 */
router.put("/:id/resume", authAndRole('charity', 'admin'), campaignController.resumeCampaign);

// ==================== GET CAMPAIGN STATS ====================

/**
 * @route GET /api/campaigns/stats/charity/:charityId
 * @desc Get campaign statistics for a charity
 * @access Private (Charity owner or Admin)
 */
router.get("/stats/charity/:charityId", authAndRole('charity', 'admin'), campaignController.getCampaignStats);
// routes/campaignRoutes.js (or donationRoutes.js)

/**
 * @route GET /api/campaigns/:id/donate
 * @desc Get campaign details for donation page
 * @access Public
 */
router.get('/:id/donate',campaignController.getCampaignForDonation);
// ==================== DONATION LINK ====================

/**
 * @route GET /api/campaigns/donation-link/:donationLink
 * @desc Get campaign by donation link
 * @access Public
 */
router.get("/donation-link/:donationLink", campaignController.getCampaignByDonationLink);


module.exports = router;
// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../../Controllers/admin/adminController");
const campaignController = require("../../Controllers/admin/campaignController");
const { authAndRole } = require("../../middlewares/auth");
const { getDashboardStats } = require("../../Controllers/admin/dashboardStats");

// ==================== CHARITY MANAGEMENT ====================

/**
 * @route GET /api/admin/charities
 * @desc Get all charities with filters
 * @access Private (Admin only)
 */
router.get("/charities", authAndRole("admin"), adminController.getCharities);
/**
 * @route GET /api/admin/charities/:id
 * @desc Get single charity details
 * @access Private (Admin only)
 */
router.get("/charities/:id",authAndRole("admin") , adminController.getCharityById);

/**
 * @route PUT /api/admin/charities/:id/approve
 * @desc Approve a charity
 * @access Private (Admin only)
 */
router.put("/charities/:id/approve", authAndRole("admin"), adminController.approveCharity);

/**
 * @route PUT /api/admin/charities/:id/reject
 * @desc Reject a charity
 * @access Private (Admin only)
 */
router.put("/charities/:id/reject", authAndRole("admin"), adminController.rejectCharity);

/**
 * @route PUT /api/admin/charities/:id/verify
 * @desc Verify a charity (add verified badge)
 * @access Private (Admin only)
 */
router.put("/charities/:id/verify", authAndRole("admin"), adminController.verifyCharity);

/**
 * @route PUT /api/admin/charities/:id/suspend
 * @desc Suspend a charity
 * @access Private (Admin only)
 */
router.put("/charities/:id/suspend", authAndRole("admin"), adminController.suspendCharity);

/**
 * @route PUT /api/admin/charities/:id/activate
 * @desc Activate a suspended charity
 * @access Private (Admin only)
 */
router.put("/charities/:id/activate", authAndRole("admin"), adminController.activateCharity);

/**
 * @route DELETE /api/admin/charities/:id
 * @desc Delete a charity (hard delete)
 * @access Private (Admin only)
 */
router.delete("/charities/:id", authAndRole("admin"), adminController.deleteCharity);

// ==================== ADMIN STATS ====================

/**
 * @route GET /api/admin/stats
 * @desc Get admin dashboard stats
 * @access Private (Admin only)
 */
router.get("/stats", authAndRole("admin"), adminController.getAdminStats);



/**
 * @route GET /api/admin/campaigns
 * @desc Get all campaigns with filters for admin
 * @access Private (Admin only)
 */
router.get("/campaigns", authAndRole("admin"), campaignController.getCampaigns);

/**
 * @route GET /api/admin/campaigns/:id
 * @desc Get single campaign details for admin
 * @access Private (Admin only)
 */
router.get("/campaigns/:id", authAndRole("admin"), campaignController.getCampaignById);

/**
 * @route PUT /api/admin/campaigns/:id/approve
 * @desc Approve campaign (Admin only)
 * @access Private (Admin only)
 */
router.put("/campaigns/:id/approve", authAndRole("admin"), campaignController.approveCampaign);

/**
 * @route PUT /api/admin/campaigns/:id/reject
 * @desc Reject campaign (Admin only)
 * @access Private (Admin only)
 */
router.put("/campaigns/:id/reject", authAndRole("admin"), campaignController.rejectCampaign);
// routes/adminRoutes.js

/**
 * @route GET /api/admin/dashboard/stats
 * @desc Get admin dashboard statistics with charts data
 * @access Private (Admin only)
 */
router.get("/dashboard/stats", authAndRole("admin"),getDashboardStats);


module.exports = router;
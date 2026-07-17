const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../../models/User.js');
const Verification = require('../../models/Verification.js');
const ActivityLog = require('../../models/ActivityLog.js');
const { sendEmail } = require('../../utils/emailService.js');
const adminController = require("../../Controllers/admin/adminController.js");
const { upload } = require('../../config/multerConfig.js');
const campaignController = require("../../Controllers/admin/campaignController.js");
const { authAndRole } = require("../../middlewares/auth.js");
const { getDashboardStats } = require("../../Controllers/admin/dashboardStats.js");

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
// routes/adminRoutes.js

/**
 * @route PUT /api/admin/charities/:id/approve
 * @desc Approve a charity
 * @access Private (Admin only)
 */
router.put('/charities/:id/approve', authAndRole('admin'), async (req, res) => {
  try {
    const { id } = req.params; 
    const { adminNote } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid charity ID',
      });
    }

    // Find charity
    const charity = await User.findById(id);
    if (!charity || charity.role !== 'charity') {
      return res.status(404).json({
        success: false,
        message: 'Charity not found',
      });
    }

    // Check if already approved
    if (charity.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Charity is already approved',
      });
    }

    // Update charity status
    charity.isApproved = true;
    charity.isActive = true;
    charity.isRejected = false;
    charity.isVerified = true;
    charity.approvedAt = new Date();
    charity.approvedBy = req.userId;
    if (adminNote) charity.adminNote = adminNote;

    // Update verification status
    const verification = await Verification.findOne({ charityId: id });
    if (verification) {
      verification.status = 'verified';
      verification.reviewedAt = new Date();
      verification.reviewedBy = req.userId;

      // Mark all required documents as verified
      verification.documents.forEach(doc => {
        if (doc.required && doc.status !== 'verified') {
          doc.status = 'verified';
          doc.verifiedAt = new Date();
          doc.verifiedBy = req.userId;
          doc.adminNotes = 'Automatically approved by admin action.';
        }
      });
      await verification.save();
    }

    await charity.save();

    // Log activity
    await ActivityLog.create({
      userId: req.userId,
      action: `Approved charity: ${charity.email}`,
      type: 'charity_approval',
      details: { charityId: charity._id },
    });

    // Send approval email to charity
    await sendApprovalEmail(charity);

    res.status(200).json({
      success: true,
      message: 'Charity approved successfully',
      data: {
        charity,
        verification,
      },
    });

  } catch (error) {
    //console.error('Approve charity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve charity',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/admin/charities/:id/reject
 * @desc Reject a charity
 * @access Private (Admin only)
 */
router.put('/charities/:id/reject', authAndRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid charity ID',
      });
    }

    // Find charity
    const charity = await User.findById(id);
    if (!charity || charity.role !== 'charity') {
      return res.status(404).json({
        success: false,
        message: 'Charity not found',
      });
    }

    // Check if already rejected
    if (charity.isRejected) {
      return res.status(400).json({
        success: false,
        message: 'Charity is already rejected',
      });
    }

    // Update charity status
    charity.isApproved = false;
    charity.isActive = false;
    charity.isRejected = true;
    charity.rejectionReason = rejectionReason;
    charity.rejectedAt = new Date();
    charity.rejectedBy = req.userId;

    // Update verification status
    const verification = await Verification.findOne({ charityId: id });
    if (verification) {
      verification.status = 'rejected';
      verification.reviewedAt = new Date();
      verification.reviewedBy = req.userId;
      verification.feedback = rejectionReason;
      await verification.save();
    }

    await charity.save();

    // Log activity
    await ActivityLog.create({
      userId: req.userId,
      action: `Rejected charity: ${charity.email}`,
      type: 'charity_rejection',
      details: { 
        charityId: charity._id,
        reason: rejectionReason 
      },
    });

    // Send rejection email to charity
    await sendRejectionEmail(charity, rejectionReason);

    res.status(200).json({
      success: true,
      message: 'Charity rejected successfully',
      data: {
        charity,
        verification,
      },
    });

  } catch (error) {
    //console.error('Reject charity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject charity',
      error: error.message,
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Send approval email to charity
 */
const sendApprovalEmail = async (charity) => {
  try {
    const emailContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }
          .content { padding: 30px; }
          .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Congratulations!</h1>
          </div>
          <div class="content">
            <h2>Dear ${charity.fullName || 'Charity'},</h2>
            <p>We are pleased to inform you that your charity application has been <strong>approved</strong>!</p>
            <p>You are now eligible to:</p>
            <ul>
              <li>Create fundraising campaigns</li>
              <li>Receive donations from supporters</li>
              <li>Access all charity features on the platform</li>
            </ul>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/charity/dashboard" class="button">Go to Dashboard</a>
            </p>
            <p>Welcome to the CharityConnect community! 🚀</p>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: charity.email,
      subject: 'Your Charity Application Has Been Approved! 🎉',
      html: emailContent,
    });

  } catch (error) {
    //console.error('Send approval email error:', error);
  }
};

/**
 * Send rejection email to charity
 */
const sendRejectionEmail = async (charity, reason) => {
  try {
    const emailContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; padding: 20px; background: #e74c3c; color: white; border-radius: 8px; }
          .content { padding: 30px; }
          .reason-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #e74c3c; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Update</h1>
          </div>
          <div class="content">
            <h2>Dear ${charity.fullName || 'Charity'},</h2>
            <p>We regret to inform you that your charity application has been <strong>rejected</strong>.</p>
            
            <div class="reason-box">
              <p><strong>Reason for rejection:</strong></p>
              <p>${reason}</p>
            </div>

            <p>Please review the feedback above and address the issues mentioned.</p>
            <p>You can update your application and resubmit it for review at any time.</p>
            
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/charity/documents" class="button" style="background: #e74c3c;">Update Application</a>
            </p>

            <p>If you have any questions, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: charity.email,
      subject: 'Your Charity Application Update',
      html: emailContent,
    });

  } catch (error) {
    //console.error('Send rejection email error:', error);
  }
};
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
 * @route GET /api/admin/donations
 * @desc Get all donations with filters
 * @access Private (Admin only)
 */
router.get("/donations", authAndRole("admin"), adminController.getDonations);

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

/**
 * @route PUT /api/admin/campaigns/:id/pause
 * @desc Pause campaign (Admin only)
 * @access Private (Admin only)
 */
router.put("/campaigns/:id/pause", authAndRole("admin"), campaignController.pauseCampaign);

/**
 * @route PUT /api/admin/campaigns/:id/resume
 * @desc Resume campaign (Admin only)
 * @access Private (Admin only)
 */
router.put("/campaigns/:id/resume", authAndRole("admin"), campaignController.resumeCampaign);
// routes/adminRoutes.js

/**
 * @route GET /api/admin/dashboard/stats
 * @desc Get admin dashboard statistics with charts data
 * @access Private (Admin only)
 */
router.get("/dashboard/stats", authAndRole("admin"),getDashboardStats);

/**
 * @route GET /api/admin/public-stats
 * @desc Get public statistics for landing page
 * @access Public
 */
router.get("/public-stats", adminController.getPublicStats);

/**
 * @route GET /api/admin/info/*
 * @desc Get public information like footer, contact etc.
 * @access Public
 */
router.use('/info', require('./settings.js'));

/**
 * @route PUT /api/admin/profile
 * @desc Update admin profile
 * @access Private (Admin only)
 */
router.put('/profile', authAndRole('admin'), upload.single('profileImage'), adminController.updateProfile);


module.exports = router;
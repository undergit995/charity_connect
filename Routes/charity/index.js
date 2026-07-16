const express = require('express');
const router = express.Router();
const { authAndRole } = require('../../middlewares/auth.js');
const charityController = require('../../Controllers/charity/charityController.js');
const donationController = require('../../Controllers/charity/donationController.js');
const { formatDistanceToNow } = require('date-fns');
const User = require('../../models/User.js');
const Donation = require('../../models/Donation.js');
const { upload } = require('../../config/multerConfig.js');
const Campaign = require('../../models/CampaignModel.js');
const mongoose = require('mongoose');



// ==================== CHARITY CAMPAIGN ROUTES ====================

/**
 * @route GET /api/charity/campaigns
 * @desc Get all campaigns for the logged-in charity
 * @access Private (Charity only)
 */
router.get('/campaigns', authAndRole('charity'), charityController.getCharityCampaigns);

/**
 * @route GET /api/charity/campaigns/:id
 * @desc Get single campaign for charity
 * @access Private (Charity owner)
 */
router.get('/campaigns/:id', authAndRole('charity'), charityController.getCampaignById);

/**
 * @route PUT /api/charity/campaigns/:id/submit
 * @desc Submit campaign for review
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/submit', authAndRole('charity'), charityController.submitCampaignForReview);

/**
 * @route PUT /api/charity/campaigns/:id/pause
 * @desc Pause campaign
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/pause', authAndRole('charity'), charityController.pauseCampaign);

/**
 * @route PUT /api/charity/campaigns/:id/resume
 * @desc Resume campaign
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/resume', authAndRole('charity'), charityController.resumeCampaign);

/**
 * @route PUT /api/charity/campaigns/:id/complete
 * @desc Complete campaign
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/complete', authAndRole('charity'), charityController.completeCampaign);

/**
 * @route PUT /api/charity/campaigns/:id/cancel-request
 * @desc Cancel pending request
 * @access Private (Charity owner)
 */
router.put('/campaigns/:id/cancel-request', authAndRole('charity'), charityController.cancelRequest);

/**
 * @route DELETE /api/charity/campaigns/:id
 * @desc Delete campaign (soft delete)
 * @access Private (Charity owner)
 */
router.delete('/campaigns/:id', authAndRole('charity'), charityController.deleteCampaign);

/**
 * @route GET /api/charity/campaigns/stats
 * @desc Get campaign statistics
 * @access Private (Charity)
 */
router.get('/campaigns/stats', authAndRole('charity'), charityController.getCampaignStats);

/**
 * @route POST /api/charity/campaigns/resolve-conflict
 * @desc Resolve version conflict
 * @access Private (Charity)
 */
router.post('/campaigns/resolve-conflict', authAndRole('charity'), charityController.resolveConflict);
// routes/charityRoutes.js

/**
 * @route GET /api/charity/dashboard/stats
 * @desc Get charity dashboard statistics
 * @access Private (Charity only)
 */
router.get("/dashboard/stats", authAndRole('charity'), charityController.getDashboardStats);
// routes/charityRoutes.js

/**
 * @route GET /api/charity/donations
 * @desc Get all donations for a charity with pagination and filters
 * @access Private (Charity only)
 */
router.get('/donations', authAndRole('charity'), donationController.getCharityDonations);

/**
 * @route GET /api/charity/donations/:id
 * @desc Get single donation details
 * @access Private (Charity only)
 */
router.get('/donations/:id', authAndRole('charity'), donationController.getDonationDetails);

/**
 * @route GET /api/charity/donations/export/pdf
 * @desc Export donations as PDF
 * @access Private (Charity only)
 */
router.get('/donations/export/pdf', authAndRole('charity'), async (req, res) => {
  try {
    const charityId = req.userId;
    const { status, startDate, endDate } = req.query;

    const query = { charityId };
    if (status && status !== 'all') query.status = status;
    if (startDate) query.donationDate = { ...query.donationDate, $gte: new Date(startDate) };
    if (endDate) query.donationDate = { ...query.donationDate, $lte: new Date(endDate) };

    const donations = await Donation.find(query)
      .populate('donorId', 'fullName email')
      .populate('campaignId', 'title')
      .sort({ donationDate: -1 })
      .lean();

    // Generate PDF (using pdfkit or similar)
    // For now, return JSON data
    res.status(200).json({
      success: true,
      data: donations.map((d) => ({
        receiptNumber: d.receiptNumber,
        amount: d.amount,
        donor: d.isAnonymous ? 'Anonymous' : (d.donorName || d.donorId?.fullName || 'Guest'),
        campaign: d.campaignId?.title || 'Unknown',
        status: d.status,
        date: d.donationDate,
      })),
    });
  } catch (error) {
    //console.error('Export PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export PDF',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/charity/donations/export/excel
 * @desc Export donations as Excel
 * @access Private (Charity only)
 */
router.get('/donations/export/excel', authAndRole('charity'), async (req, res) => {
  try {
    const charityId = req.userId;
    const { status, startDate, endDate } = req.query;

    const query = { charityId };
    if (status && status !== 'all') query.status = status;
    if (startDate) query.donationDate = { ...query.donationDate, $gte: new Date(startDate) };
    if (endDate) query.donationDate = { ...query.donationDate, $lte: new Date(endDate) };

    const donations = await Donation.find(query)
      .populate('donorId', 'fullName email')
      .populate('campaignId', 'title')
      .sort({ donationDate: -1 })
      .lean();

    // Generate Excel (using exceljs or similar)
    // For now, return JSON data
    res.status(200).json({
      success: true,
      data: donations.map((d) => ({
        'Receipt Number': d.receiptNumber,
        'Amount': d.amount,
        'Currency': d.currency || 'INR',
        'Donor': d.isAnonymous ? 'Anonymous' : (d.donorName || d.donorId?.fullName || 'Guest'),
        'Campaign': d.campaignId?.title || 'Unknown',
        'Status': d.status,
        'Payment Method': d.paymentMethod,
        'Date': d.donationDate,
        'Transaction ID': d.transactionId,
        'Message': d.message || '',
      })),
    });
  } catch (error) {
     //console.error('Export Excel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export Excel',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/charity/donations/stats
 * @desc Get donation statistics for charity dashboard
 * @access Private (Charity only)
 */
router.get('/donations/stats', authAndRole('charity'), async (req, res) => {
  try {
    const charityId = req.userId;

    // Get overall stats
    const overallStats = await Donation.aggregate([
      { $match: { charityId } },
      {
        $group: {
          _id: null,
          totalDonations: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          completedDonations: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] },
          },
          completedAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, '$amount', 0] },
          },
          pendingDonations: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] },
          },
          failedDonations: {
            $sum: { $cond: [{ $eq: ['$status', 'Failed'] }, 1, 0] },
          },
          refundedDonations: {
            $sum: { $cond: [{ $eq: ['$status', 'Refunded'] }, 1, 0] },
          },
          uniqueDonors: { $addToSet: '$donorId' },
        },
      },
    ]);

    // Get daily stats for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyStats = await Donation.aggregate([
      {
        $match: {
          charityId,
          donationDate: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$donationDate' },
            month: { $month: '$donationDate' },
            day: { $dayOfMonth: '$donationDate' },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: overallStats[0] || {
          totalDonations: 0,
          totalAmount: 0,
          completedDonations: 0,
          completedAmount: 0,
          pendingDonations: 0,
          failedDonations: 0,
          refundedDonations: 0,
          uniqueDonors: [],
        },
        daily: dailyStats.map((item) => ({
          date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
          amount: item.amount,
          count: item.count,
        })),
      },
    });
  } catch (error) {
    //console.error('Get donation stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donation stats',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/charity/donations/:id/refund
 * @desc Refund a donation
 * @access Private (Charity only)
 */
router.put('/donations/:id/refund', authAndRole('charity'), donationController.refundDonation);

/**
 * @route PUT /api/charity/profile
 * @desc Update charity profile
 * @access Private (Charity only)
 */
router.put('/profile', authAndRole('charity'),  upload.fields([{ name: 'profileImage', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), charityController.updateProfile);

module.exports = router;
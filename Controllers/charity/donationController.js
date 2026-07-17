const mongoose = require('mongoose');
const User = require('../../models/User.js');
const Donation = require('../../models/Donation.js');
const Campaign = require('../../models/CampaignModel.js');

/**
 * @route GET /api/charity/donations
 * @desc Get all donations for a charity with pagination and filters
 * @access Private (Charity only)
 */
exports.getCharityDonations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate,
    } = req.query;

    const charityId = req.userId;

    // Verify charity
    const charity = await User.findById(charityId);
    if (!charity || charity.role !== 'charity') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Charity only.',
      });
    }

    // Build query
    const query = { charityId };

    // Filter by status
    if (status !== 'all') {
      query.status = status;
    }

    // Search by donor name, email, or transaction ID
    if (search) {
      // First find donors matching search
      const matchingDonors = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const donorIds = matchingDonors.map(d => d._id);

      query.$or = [
        { donorId: { $in: donorIds } },
        { transactionId: { $regex: search, $options: 'i' } },
        { receiptNumber: { $regex: search, $options: 'i' } },
        { donorName: { $regex: search, $options: 'i' } },
        { donorEmail: { $regex: search, $options: 'i' } },
      ];
    }

    // Date range filter
    if (startDate) {
      query.donationDate = { ...query.donationDate, $gte: new Date(startDate) };
    }
    if (endDate) {
      query.donationDate = { ...query.donationDate, $lte: new Date(endDate) };
    }

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get donations with pagination
    const [donations, total] = await Promise.all([
      Donation.find(query)
        .populate('donorId', 'fullName email profileImage')
        .populate('campaignId', 'title coverImage')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Donation.countDocuments(query),
    ]);

    // Get summary statistics
    const summary = await Donation.aggregate([
      { $match: { charityId, status: 'Completed' } },
      {
        $group: {
          _id: null,
          totalDonations: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          totalDonors: { $addToSet: '$donorId' },
        },
      },
      {
        $project: {
          totalDonations: 1,
          totalAmount: 1,
          averageAmount: 1,
          totalDonors: { $size: '$totalDonors' },
        },
      },
    ]);

    // Get status breakdown
    const statusBreakdown = await Donation.aggregate([
      { $match: { charityId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    // Get monthly donation trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await Donation.aggregate([
      {
        $match: {
          charityId,
          status: 'Completed',
          donationDate: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$donationDate' },
            month: { $month: '$donationDate' },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Format donations for response
    const formattedDonations = donations.map((donation) => ({
      _id: donation._id,
      amount: donation.amount,
      currency: donation.currency || 'INR',
      status: donation.status,
      transactionId: donation.transactionId,
      receiptNumber: donation.receiptNumber,
      donationDate: donation.donationDate,
      isAnonymous: donation.isAnonymous,
      message: donation.message,
      paymentMethod: donation.paymentMethod,
      donorId: donation.donorId,
      donorName: donation.isAnonymous ? 'Anonymous' : (donation.donorName || donation.donorId?.fullName || 'Guest'),
      donorEmail: donation.isAnonymous ? null : (donation.donorEmail || donation.donorId?.email),
      campaignId: donation.campaignId,
      campaignTitle: donation.campaignId?.title || 'Unknown Campaign',
      campaignImage: donation.campaignId?.coverImage || null,
      createdAt: donation.createdAt,
      updatedAt: donation.updatedAt,
    }));

    // Format status breakdown
    const formattedStatusBreakdown = statusBreakdown.reduce((acc, item) => {
      acc[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount,
      };
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      donations: formattedDonations,
      summary: summary[0] || {
        totalDonations: 0,
        totalAmount: 0,
        averageAmount: 0,
        totalDonors: 0,
      },
      statusBreakdown: formattedStatusBreakdown,
      monthlyTrend: monthlyTrend.map((item) => ({
        month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
        amount: item.amount,
        count: item.count,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    //console.error('Get charity donations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donations',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/charity/donations/:id
 * @desc Get single donation details
 * @access Private (Charity only)
 */
exports.getDonationDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const charityId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid donation ID',
      });
    }

    const donation = await Donation.findOne({
      _id: id,
      charityId,
    })
      .populate('donorId', 'fullName email phone profileImage')
      .populate('campaignId', 'title description coverImage category')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found or you do not have access',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: donation._id,
        amount: donation.amount,
        currency: donation.currency || 'INR',
        status: donation.status,
        transactionId: donation.transactionId,
        receiptNumber: donation.receiptNumber,
        donationDate: donation.donationDate,
        completedAt: donation.completedAt,
        isAnonymous: donation.isAnonymous,
        message: donation.message,
        paymentMethod: donation.paymentMethod,
        donor: donation.isAnonymous ? null : {
          _id: donation.donorId?._id,
          fullName: donation.donorName || donation.donorId?.fullName || 'Guest',
          email: donation.donorEmail || donation.donorId?.email,
          phone: donation.donorId?.phone,
          profileImage: donation.donorId?.profileImage,
        },
        campaign: {
          _id: donation.campaignId?._id,
          title: donation.campaignId?.title || 'Unknown Campaign',
          description: donation.campaignId?.description,
          coverImage: donation.campaignId?.coverImage,
          category: donation.campaignId?.category,
        },
        razorpayOrderId: donation.razorpayOrderId,
        razorpayPaymentId: donation.razorpayPaymentId,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt,
      },
    });
  } catch (error) {
    //console.error('Get donation details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donation details',
      error: error.message,
    });
  }
};

/**
 * @route PUT /api/charity/donations/:id/refund
 * @desc Refund a donation
 * @access Private (Charity only)
 */
exports.refundDonation = async (req, res) => {
  try {
    const { id } = req.params;
    const charityId = req.userId;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid donation ID',
      });
    }

    const donation = await Donation.findOne({
      _id: id,
      charityId,
    });

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found or you do not have access',
      });
    }

    if (donation.status !== 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed donations can be refunded',
      });
    }

    // Process refund
    donation.status = 'Refunded';
    donation.refundReason = reason || 'Refund requested by charity';
    donation.refundedAt = new Date();

    await donation.save();

    // Deduct from campaign raised amount
    await Campaign.findByIdAndUpdate(donation.campaignId, {
      $inc: {
        raisedAmount: -donation.amount,
        'stats.donorCount': -1,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Donation refunded successfully',
      data: donation,
    });
  } catch (error) {
    //console.error('Refund donation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refund donation',
      error: error.message,
    });
  }
};
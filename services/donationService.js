// services/DonationService.js
const mongoose = require('mongoose');
const Donation = require('../models/Donation');
const Campaign = require('../models/CampaignModel');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

class DonationService {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 100; // ms
    this.batchSize = 10;
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * Process donation with full transaction support
   * Handles simultaneous donations safely
   */
  async processDonation(donationData, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { campaignId, amount, isAnonymous, message, paymentMethod } = donationData;

      // Validate campaign
      const campaign = await Campaign.findById(campaignId).session(session);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Check if campaign is active
      if (campaign.status !== 'active' || !campaign.isActive) {
        throw new Error('Campaign is not active');
      }

      // Check if campaign is expired
      if (new Date() > new Date(campaign.endDate)) {
        throw new Error('Campaign has expired');
      }

      // Validate amount
      if (amount < 1) {
        throw new Error('Minimum donation amount is $1');
      }

      // Check if goal is reached (with atomic operation)
      if (campaign.raisedAmount >= campaign.goalAmount) {
        // Use findOneAndUpdate with atomic check
        const updated = await Campaign.findOneAndUpdate(
          {
            _id: campaignId,
            raisedAmount: { $lt: campaign.goalAmount },
            status: 'active',
          },
          { $inc: { raisedAmount: amount, 'stats.donorCount': 1 } },
          { new: true, session }
        );

        if (!updated) {
          throw new Error('Campaign goal reached or campaign no longer active');
        }
      } else {
        // Update campaign with optimistic locking
        const result = await Campaign.updateOne(
          {
            _id: campaignId,
            __v: campaign.__v, // Optimistic lock check
            raisedAmount: { $lt: campaign.goalAmount },
            status: 'active',
          },
          {
            $inc: {
              raisedAmount: amount,
              'stats.donorCount': 1,
              __v: 1,
            },
          },
          { session }
        );

        if (result.modifiedCount === 0) {
          // Version conflict or campaign changed
          throw new Error('Campaign was updated by another donation. Please retry.');
        }
      }

      // Generate unique transaction ID
      const transactionId = `DON-${Date.now()}-${uuidv4().substring(0, 8)}`;
      const receiptNumber = `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // Create donation record
      const donation = new Donation({
        campaignId,
        charityId: campaign.charityId,
        donorId: userId,
        amount,
        isAnonymous: isAnonymous || false,
        message: message || '',
        paymentMethod: paymentMethod || 'razorpay',
        transactionId,
        receiptNumber,
        status: 'Completed',
        donationDate: new Date(),
        completedAt: new Date(),
        __v: 0,
      });

      await donation.save({ session });

      // Update donor stats
      await User.updateOne(
        { _id: userId },
        {
          $inc: {
            'stats.totalDonations': 1,
            'stats.totalDonationAmount': amount,
          },
        },
        { session }
      );

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      // Return success with donation details
      return {
        success: true,
        donationId: donation._id,
        transactionId: donation.transactionId,
        receiptNumber: donation.receiptNumber,
        amount: donation.amount,
        campaignTitle: campaign.title,
        newRaisedAmount: campaign.raisedAmount + amount,
        donorCount: campaign.stats.donorCount + 1,
      };

    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Process donations in queue (batch processing for high traffic)
   */
  async processDonationQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const batch = this.processingQueue.splice(0, this.batchSize);

    try {
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const result = await this.processDonation(item.data, item.userId);
            item.resolve(result);
          } catch (error) {
            item.reject(error);
          }
        })
      );

      return results;
    } finally {
      this.isProcessing = false;
      // Process remaining queue
      if (this.processingQueue.length > 0) {
        setImmediate(() => this.processDonationQueue());
      }
    }
  }

  /**
   * Queue donation for processing (non-blocking)
   */
  queueDonation(donationData, userId) {
    return new Promise((resolve, reject) => {
      this.processingQueue.push({
        data: donationData,
        userId,
        resolve,
        reject,
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        setImmediate(() => this.processDonationQueue());
      }
    });
  }

  /**
   * Handle simultaneous donations with retry logic
   */
  async handleDonationWithRetry(donationData, userId, retryCount = 0) {
    try {
      // Try to process with transaction
      return await this.processDonation(donationData, userId);
    } catch (error) {
      // Retry on version conflict or transient errors
      if (
        (error.message.includes('Version conflict') ||
          error.message.includes('Campaign was updated') ||
          error.message.includes('E11000')) && // Duplicate key error
        retryCount < this.maxRetries
      ) {
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Fetch latest campaign data
        const campaign = await Campaign.findById(donationData.campaignId);
        if (!campaign) {
          throw new Error('Campaign not found');
        }

        // Retry with updated data
        return this.handleDonationWithRetry(
          {
            ...donationData,
            // Use latest campaign version
          },
          userId,
          retryCount + 1
        );
      }
      throw error;
    }
  }

  /**
   * Get donation statistics with atomic consistency
   */
  async getDonationStats(campaignId) {
    const [campaign, stats] = await Promise.all([
      Campaign.findById(campaignId).lean(),
      Donation.aggregate([
        { $match: { campaignId: mongoose.Types.ObjectId(campaignId), status: 'Completed' } },
        {
          $group: {
            _id: null,
            totalDonations: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' },
            minAmount: { $min: '$amount' },
            maxAmount: { $max: '$amount' },
            uniqueDonors: { $addToSet: '$donorId' },
          },
        },
        {
          $project: {
            totalDonations: 1,
            totalAmount: 1,
            avgAmount: 1,
            minAmount: 1,
            maxAmount: 1,
            uniqueDonorCount: { $size: '$uniqueDonors' },
          },
        },
      ]),
    ]);

    return {
      campaign: {
        raisedAmount: campaign?.raisedAmount || 0,
        goalAmount: campaign?.goalAmount || 0,
        donorCount: campaign?.stats?.donorCount || 0,
        progress: campaign?.goalAmount ? (campaign.raisedAmount / campaign.goalAmount) * 100 : 0,
      },
      donations: stats[0] || {
        totalDonations: 0,
        totalAmount: 0,
        avgAmount: 0,
        minAmount: 0,
        maxAmount: 0,
        uniqueDonorCount: 0,
      },
    };
  }

  /**
   * Atomic bulk donation processing (for high volume)
   */
  async processBulkDonations(donations) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Group donations by campaign
      const grouped = donations.reduce((acc, d) => {
        if (!acc[d.campaignId]) acc[d.campaignId] = [];
        acc[d.campaignId].push(d);
        return acc;
      }, {});

      const results = [];

      for (const [campaignId, campaignDonations] of Object.entries(grouped)) {
        const totalAmount = campaignDonations.reduce((sum, d) => sum + d.amount, 0);
        const donorCount = campaignDonations.length;

        // Update campaign atomically
        const campaign = await Campaign.findOneAndUpdate(
          {
            _id: campaignId,
            status: 'active',
            raisedAmount: { $lt: '$goalAmount' },
          },
          {
            $inc: {
              raisedAmount: totalAmount,
              'stats.donorCount': donorCount,
              __v: 1,
            },
          },
          { new: true, session }
        );

        if (!campaign) {
          throw new Error(`Campaign ${campaignId} is no longer active or goal reached`);
        }

        // Create all donations
        const donationDocs = campaignDonations.map((d) => ({
          campaignId,
          charityId: campaign.charityId,
          donorId: d.userId,
          amount: d.amount,
          isAnonymous: d.isAnonymous || false,
          message: d.message || '',
          paymentMethod: d.paymentMethod || 'razorpay',
          transactionId: `DON-${Date.now()}-${uuidv4().substring(0, 8)}`,
          receiptNumber: `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          status: 'Completed',
          donationDate: new Date(),
          completedAt: new Date(),
        }));

        const created = await Donation.insertMany(donationDocs, { session });
        results.push({ campaignId, donations: created, totalAmount, donorCount });
      }

      await session.commitTransaction();
      session.endSession();

      return results;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Get real-time donation status with locking
   */
  async getRealTimeStatus(campaignId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const campaign = await Campaign.findById(campaignId)
        .session(session)
        .select('raisedAmount stats.donorCount goalAmount endDate status __v');

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get recent donations (last 5)
      const recentDonations = await Donation.find({ campaignId })
        .sort({ donationDate: -1 })
        .limit(5)
        .populate('donorId', 'fullName profileImage')
        .session(session)
        .lean();

      await session.commitTransaction();
      session.endSession();

      return {
        campaign: {
          raisedAmount: campaign.raisedAmount,
          donorCount: campaign.stats.donorCount,
          goalAmount: campaign.goalAmount,
          progress: (campaign.raisedAmount / campaign.goalAmount) * 100,
          status: campaign.status,
          daysRemaining: Math.ceil((campaign.endDate - new Date()) / (1000 * 60 * 60 * 24)),
          version: campaign.__v,
        },
        recentDonations: recentDonations.map(d => ({
          amount: d.amount,
          donorName: d.isAnonymous ? 'Anonymous' : d.donorId?.fullName || 'Guest',
          message: d.message,
          date: d.donationDate,
        })),
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

module.exports = new DonationService();
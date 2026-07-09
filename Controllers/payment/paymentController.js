const mongoose = require('mongoose');
const crypto = require('crypto');
const { razorpay, verifyPaymentSignature } = require('../../config/razorpay');
const Donation = require('../../models/Donation');
const Campaign = require('../../models/CampaignModel');
const User = require('../../models/User');
const { sendEmail } = require('../../utils/emailService');

/**
 * @desc Create Razorpay order
 * @route POST /api/payments/create-order
 * @access Private
 */
exports.createOrder = async (req, res) => {
  try {
    const { amount, campaignId, currency = 'INR', isAnonymous, message } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid donation amount is required',
      });
    }

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required',
      });
    }

    // Validate campaign
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    if (campaign.status !== 'active' || !campaign.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not active',
      });
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100,
      currency: currency,
      receipt: `donation_${Date.now()}`,
      notes: {
        campaignId: campaignId.toString(),
        userId: req.userId,
        isAnonymous: isAnonymous ? 'true' : 'false',
        message: message || '',
      },
    };

    const order = await razorpay.orders.create(options);

    // Save order in database with pending status
    const donation = new Donation({
      donorId: req.userId,
      campaignId: campaignId,
      charityId: campaign.charityId,
      amount: amount,
      currency: currency,
      isAnonymous: isAnonymous || false,
      message: message || '',
      paymentMethod: 'razorpay',
      razorpayOrderId: order.id,
      status: 'Pending',
      donationDate: new Date(),
    });

    await donation.save();
console.log(donation);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        donationId: donation._id,
      },
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message,
    });
  }
};

/**
 * @desc Verify Razorpay payment
 * @route POST /api/payments/verify
 * @access Private
 */
exports.verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      signature,
      donationId,
    } = req.body;

    // Verify signature
    const isValid = verifyPaymentSignature(orderId, paymentId, signature);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
      });
    }

    // Find donation
    const donation = await Donation.findById(donationId);
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Update donation status
    donation.status = 'Completed';
    donation.razorpayPaymentId = paymentId;
    donation.razorpaySignature = signature;
    donation.transactionId = paymentId;
    donation.completedAt = new Date();

    // Generate receipt number
    const receiptNumber = `DON-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    donation.receiptNumber = receiptNumber;

    await donation.save();

    // Update campaign stats
    const campaign = await Campaign.findById(donation.campaignId);
    if (campaign) {
      campaign.raisedAmount = (campaign.raisedAmount || 0) + donation.amount;
      campaign.stats.donorCount = (campaign.stats.donorCount || 0) + 1;
      campaign.stats.averageDonation = campaign.raisedAmount / campaign.stats.donorCount;
      await campaign.save();
    }

    // Update donor stats
    if (donation.donorId) {
      await User.findByIdAndUpdate(donation.donorId, {
        $inc: {
          'stats.totalDonations': 1,
          'stats.totalDonationAmount': donation.amount,
        },
      });
    }

    // Send receipt email
    const donor = await User.findById(donation.donorId);
    if (donor && donor.email) {
      await sendEmail({
        to: donor.email,
        subject: `Donation Receipt - ${donation.receiptNumber}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }
              .content { padding: 30px; }
              .receipt-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Thank You! 🙏</h1>
              </div>
              <div class="content">
                <h2>Dear ${donor.fullName || 'Donor'},</h2>
                <p>Thank you for your generous donation to <strong>${campaign.title}</strong>.</p>
                <div class="receipt-box">
                  <div class="row">
                    <span><strong>Receipt Number</strong></span>
                    <span>${donation.receiptNumber}</span>
                  </div>
                  <div class="row">
                    <span><strong>Amount</strong></span>
                    <span>₹${donation.amount}</span>
                  </div>
                  <div class="row">
                    <span><strong>Transaction ID</strong></span>
                    <span>${donation.transactionId}</span>
                  </div>
                  <div class="row">
                    <span><strong>Date</strong></span>
                    <span>${new Date(donation.completedAt).toLocaleString()}</span>
                  </div>
                </div>
                <p style="text-align: center;">
                  <a href="${process.env.FRONTEND_URL}/donor/donations/${donation._id}/receipt" style="display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px;">
                    Download Full Receipt
                  </a>
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        donationId: donation._id,
        receiptNumber: donation.receiptNumber,
      },
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message,
    });
  }
};

/**
 * @desc Razorpay webhook handler
 * @route POST /api/payments/webhook
 * @access Public (with signature verification)
 */
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }

    const { event, payload } = req.body;

    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;

      // Find donation by order ID
      const donation = await Donation.findOne({ razorpayOrderId: orderId });
      
      if (donation && donation.status === 'Pending') {
        donation.status = 'Completed';
        donation.razorpayPaymentId = payment.id;
        donation.transactionId = payment.id;
        donation.completedAt = new Date();

        // Generate receipt number
        const receiptNumber = `DON-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        donation.receiptNumber = receiptNumber;

        await donation.save();

        // Update campaign stats
        const campaign = await Campaign.findById(donation.campaignId);
        if (campaign) {
          campaign.raisedAmount = (campaign.raisedAmount || 0) + donation.amount;
          campaign.stats.donorCount = (campaign.stats.donorCount || 0) + 1;
          await campaign.save();
        }

        // Update donor stats
        if (donation.donorId) {
          await User.findByIdAndUpdate(donation.donorId, {
            $inc: {
              'stats.totalDonations': 1,
              'stats.totalDonationAmount': donation.amount,
            },
          });
        }
      }
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
    });
  }
};
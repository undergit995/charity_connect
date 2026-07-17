const mongoose = require("mongoose");
const User = require("../../models/User");
const Campaign = require("../../models/CampaignModel");
const Donation = require("../../models/Donation");
const Verification = require("../../models/Verification");
const otpService = require("../../utils/otpService.js");
const { getFileUrl } = require("../../config/multerConfig");
const ActivityLog = require("../../models/ActivityLog");
const { sendEmail } = require("../../config/mailConfig");

// ==================== ADMIN MIDDLEWARE ====================

exports.isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }
        req.admin = user;
        next();
    } catch (error) {
        // console.error("Admin middleware error:", error);
        res.status(500).json({
            success: false,
            message: "Authorization error",
            error: error.message
        });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            phone,
            bio,
            address,
            city,
            state,
            country,
            zipCode,
            email,
            emailChangeToken,
        } = req.body;
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (firstName || lastName) user.fullName = `${user.firstName} ${user.lastName}`;
        if (phone) user.phone = phone;
        if (bio) user.bio = bio;

        if (!user.address) user.address = {};
        if (address) user.address.street = address;
        if (city) user.address.city = city;
        if (state) user.address.state = state;
        if (country) user.address.country = country;
        if (zipCode) user.address.zipCode = zipCode;

        // Handle email change
        if (email && email !== user.email) {
            if (!emailChangeToken) {
                return res.status(400).json({ success: false, message: 'Email change requires verification token.' });
            }
            const verificationResult = await otpService.verifyOTP(email, emailChangeToken, 'email-change');
            if (!verificationResult.success) {
                return res.status(400).json({ success: false, message: `Email verification failed: ${verificationResult.message}` });
            }
            // Check for email uniqueness before updating
            const existingUserWithNewEmail = await User.findOne({ email: email });
            if (existingUserWithNewEmail) {
                return res.status(400).json({ success: false, message: 'This email address is already in use.' });
            }
            user.email = email;
        }

        if (req.file) {
            user.profileImage = getFileUrl(req, req.file.path);
        }

        await user.save();
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({ success: true, message: 'Profile updated successfully', data: { user: userResponse } });
    } catch (error) {
        // console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Error updating profile', error: error.message });
    }
};

// ==================== CHARITY MANAGEMENT ====================

/**
 * @route GET /api/admin/charities
 * @desc Get all charities with filters
 * @access Private (Admin only)
 */
exports.getCharities = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            status = 'all' 
        } = req.query;

        const query = { role: 'charity' };

        // Filter by status
        if (status === 'pending') {
            query.isApproved = false;
            query.isRejected = { $ne: true };
        } else if (status === 'approved') {
            query.isApproved = true;
            query.isActive = true;
        } else if (status === 'rejected') {
            query.isRejected = true;
        } else if (status === 'suspended') {
            query.isApproved = true;
            query.isActive = false;
            query.isRejected = { $ne: true };
        }

        // Search
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { 'charityDetails.organizationName': { $regex: search, $options: 'i' } },
                { 'charityDetails.registrationNumber': { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [charities, total] = await Promise.all([
            User.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 })
                .select('-password -resetPasswordToken -resetPasswordExpires'),
            User.countDocuments(query)
        ]);

        // Get stats
        const stats = await User.aggregate([
            { $match: { role: 'charity' } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: { 
                        $sum: { 
                            $cond: [{ 
                                $and: [
                                    { $eq: ["$isApproved", false] },
                                    { $ne: ["$isRejected", true] }
                                ]
                            }, 1, 0] 
                        }
                    },
                    approved: { 
                        $sum: { 
                            $cond: [{ 
                                $and: [
                                    { $eq: ["$isApproved", true] },
                                    { $eq: ["$isActive", true] }
                                ]
                            }, 1, 0] 
                        }
                    },
                    rejected: { 
                        $sum: { $cond: [{ $eq: ["$isRejected", true] }, 1, 0] }
                    },
                    suspended: { 
                        $sum: { 
                            $cond: [{ 
                                $and: [
                                    { $eq: ["$isApproved", true] },
                                    { $eq: ["$isActive", false] },
                                    { $ne: ["$isRejected", true] }
                                ]
                            }, 1, 0] 
                        }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            charities,
            stats: stats[0] || { 
                total: 0, 
                pending: 0, 
                approved: 0, 
                rejected: 0, 
                suspended: 0 
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        // console.error("Get charities error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch charities",
            error: error.message
        });
    }
};

/**
 * @route GET /api/admin/donations
 * @desc Get all donations with filters
 * @access Private (Admin only)
 */
exports.getDonations = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            status = 'all',
            campaignId,
            charityId
        } = req.query;

        const query = {};

        // Filter by status
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (campaignId) {
            query.campaignId = campaignId;
        }

        if (charityId) {
            query.charityId = charityId;
        }

        // Search
        if (search) {
            const users = await User.find({
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ]
            }).select('_id');
            const userIds = users.map(u => u._id);

            const campaigns = await Campaign.find({
                title: { $regex: search, $options: 'i' }
            }).select('_id');
            const campaignIds = campaigns.map(c => c._id);

            query.$or = [
                { transactionId: { $regex: search, $options: 'i' } },
                { receiptNumber: { $regex: search, $options: 'i' } },
                { donorId: { $in: userIds } },
                { charityId: { $in: userIds } },
                { campaignId: { $in: campaignIds } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [donations, total] = await Promise.all([
            Donation.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ donationDate: -1 })
                .populate('donorId', 'fullName email')
                .populate('charityId', 'charityDetails.organizationName fullName')
                .populate('campaignId', 'title'),
            Donation.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            donations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        // console.error("Get admin donations error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch donations",
            error: error.message
        });
    }
};

/**
 * @route GET /api/admin/charities/:id
 * @desc Get single charity details
 * @access Private (Admin only)
 */
exports.getCharityById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id)
            .select('-password -resetPasswordToken -resetPasswordExpires')

        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        // Fetch campaigns separately
        const campaigns = await Campaign.find({ charityId: id }).select(
            "title status raisedAmount goalAmount"
        );


        // Get campaign stats
        const campaignStats = await Campaign.aggregate([
            { $match: { charityId: charity._id } },
            {
                $group: {
                    _id: null,
                    totalCampaigns: { $sum: 1 },
                    activeCampaigns: { 
                        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
                    },
                    totalRaised: { $sum: "$raisedAmount" },
                    totalDonors: { $sum: "$stats.donorCount" }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                charity,
                campaigns,
                campaignStats: campaignStats[0] || {
                    totalCampaigns: 0,
                    activeCampaigns: 0,
                    totalRaised: 0,
                    totalDonors: 0
                }
            }
        });

    } catch (error) {
        // console.error("Get charity details error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch charity details",
            error: error.message
        });
    }
};

/**
 * @route PUT /api/admin/charities/:id/approve
 * @desc Approve a charity
 * @access Private (Admin only)
 */
exports.approveCharity = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id);
        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        charity.isApproved = true;
        charity.isActive = true;
        charity.isRejected = false;
        charity.approvedAt = new Date();
        charity.approvedBy = req.userId;
        charity.rejectionReason = null;
        charity.isVerified = true; // Set the main verification flag
        await charity.save();

        // Also update the verification documents to 'verified'
        const verification = await Verification.findOne({ charityId: charity._id });
        if (verification) {
            verification.documents.forEach(doc => {
                if (doc.status !== 'verified') {
                    doc.status = 'verified';
                    doc.verifiedAt = new Date();
                    doc.verifiedBy = req.userId;
                    doc.adminNotes = 'Automatically approved by admin action.';
                }
            });
            verification.status = 'verified';
            verification.reviewedAt = new Date();
            await verification.save();
        }

        // Log activity
        await ActivityLog.create({
            userId: req.userId,
            action: `Approved charity: ${charity.email}`,
            type: "charity_approval",
            details: { charityId: charity._id }
        });

        // Send approval email
        await sendEmail({
            to: charity.email,
            subject: "Your Charity Account Has Been Approved! 🎉",
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }
                        .content { padding: 30px; }
                        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎉 Congratulations!</h1>
                        </div>
                        <div class="content">
                            <h2>Dear ${charity.fullName},</h2>
                            <p>Your charity account has been <strong>approved</strong> by the admin team.</p>
                            <p>You can now:</p>
                            <ul>
                                <li>Create fundraising campaigns</li>
                                <li>Receive donations</li>
                                <li>Manage your charity profile</li>
                                <li>Track your impact</li>
                            </ul>
                            <p style="text-align: center;">
                                <a href="${process.env.FRONTEND_URL}/charity/dashboard" class="button">Go to Dashboard</a>
                            </p>
                            <p>Welcome to the CharityConnect community! 🚀</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });

        res.status(200).json({
            success: true,
            message: "Charity approved successfully",
            data: charity
        });

    } catch (error) {
        // console.error("Approve charity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve charity",
            error: error.message
        });
    }
};

/**
 * @route PUT /api/admin/charities/:id/reject
 * @desc Reject a charity
 * @access Private (Admin only)
 */
exports.rejectCharity = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id);
        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        charity.isApproved = false;
        charity.isActive = false;
        charity.isRejected = true;
        charity.rejectionReason = rejectionReason;
        charity.rejectedAt = new Date();
        charity.rejectedBy = req.userId;
        await charity.save();

        // Log activity
        await ActivityLog.create({
            userId: req.userId,
            action: `Rejected charity: ${charity.email}`,
            type: "charity_rejection",
            details: { charityId: charity._id, reason: rejectionReason }
        });

        // Send rejection email
        await sendEmail({
            to: charity.email,
            subject: "Your Charity Account Application Update",
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { text-align: center; padding: 20px; background: #e74c3c; color: white; border-radius: 8px; }
                        .content { padding: 30px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Application Update</h1>
                        </div>
                        <div class="content">
                            <h2>Dear ${charity.fullName},</h2>
                            <p>We regret to inform you that your charity account application has been <strong>rejected</strong>.</p>
                            <p><strong>Reason:</strong> ${rejectionReason}</p>
                            <p>Please contact support if you have any questions or would like to appeal this decision.</p>
                            <p>You can also update your application and resubmit it for review.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });

        res.status(200).json({
            success: true,
            message: "Charity rejected",
            data: charity
        });

    } catch (error) {
        // console.error("Reject charity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reject charity",
            error: error.message
        });
    }
};

/**
 * @route PUT /api/admin/charities/:id/verify
 * @desc Verify a charity (add verified badge)
 * @access Private (Admin only)
 */
exports.verifyCharity = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id);
        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        if (!charity.isApproved) {
            return res.status(400).json({
                success: false,
                message: "Charity must be approved first"
            });
        }

        charity.charityDetails = charity.charityDetails || {};
        charity.charityDetails.verified = true;
        charity.charityDetails.verificationDate = new Date();
        charity.charityDetails.verifiedBy = req.userId;
        await charity.save();

        // Log activity
        await ActivityLog.create({
            userId: req.userId,
            action: `Verified charity: ${charity.email}`,
            type: "charity_verification",
            details: { charityId: charity._id }
        });

        // Send verification email
        await sendEmail({
            to: charity.email,
            subject: "Your Charity Has Been Verified! ✅",
            html: `
                <h2>Congratulations!</h2>
                <p>Dear ${charity.fullName},</p>
                <p>Your charity has been <strong>verified</strong> by the admin team.</p>
                <p>A verified badge will now appear on your profile, building trust with donors.</p>
                <p>This will help increase your campaign visibility and donor confidence.</p>
                <p><a href="${process.env.FRONTEND_URL}/charity/profile">View Your Profile</a></p>
            `
        });

        res.status(200).json({
            success: true,
            message: "Charity verified successfully",
            data: charity
        });

    } catch (error) {
        // console.error("Verify charity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify charity",
            error: error.message
        });
    }
};

/**
 * @route PUT /api/admin/charities/:id/suspend
 * @desc Suspend a charity
 * @access Private (Admin only)
 */
exports.suspendCharity = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id);
        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        if (!charity.isApproved) {
            return res.status(400).json({
                success: false,
                message: "Charity must be approved first"
            });
        }

        charity.isActive = false;
        charity.suspendedAt = new Date();
        charity.suspendedBy = req.userId;
        await charity.save();

        // Suspend all active campaigns
        await Campaign.updateMany(
            { charityId: charity._id, status: "active" },
            { status: "paused", isActive: false }
        );

        // Log activity
        await ActivityLog.create({
            userId: req.userId,
            action: `Suspended charity: ${charity.email}`,
            type: "charity_suspension",
            details: { charityId: charity._id }
        });

        // Send suspension email
        await sendEmail({
            to: charity.email,
            subject: "Your Charity Account Has Been Suspended",
            html: `
                <h2>Account Suspension Notice</h2>
                <p>Dear ${charity.fullName},</p>
                <p>Your charity account has been <strong>suspended</strong> by the admin team.</p>
                <p>All your active campaigns have been paused.</p>
                <p>Please contact support for more information about this suspension.</p>
            `
        });

        res.status(200).json({
            success: true,
            message: "Charity suspended successfully",
            data: charity
        });

    } catch (error) {
        // console.error("Suspend charity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to suspend charity",
            error: error.message
        });
    }
};

/**
 * @route PUT /api/admin/charities/:id/activate
 * @desc Activate a suspended charity
 * @access Private (Admin only)
 */
exports.activateCharity = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id);
        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        if (!charity.isApproved) {
            return res.status(400).json({
                success: false,
                message: "Charity must be approved first"
            });
        }

        charity.isActive = true;
        charity.suspendedAt = null;
        charity.suspendedBy = null;
        await charity.save();

        // Log activity
        await ActivityLog.create({
            userId: req.userId,
            action: `Activated charity: ${charity.email}`,
            type: "charity_activation",
            details: { charityId: charity._id }
        });

        // Send activation email
        await sendEmail({
            to: charity.email,
            subject: "Your Charity Account Has Been Activated",
            html: `
                <h2>Account Activated</h2>
                <p>Dear ${charity.fullName},</p>
                <p>Your charity account has been <strong>activated</strong> by the admin team.</p>
                <p>You can now resume creating campaigns and receiving donations.</p>
                <p><a href="${process.env.FRONTEND_URL}/charity/dashboard">Go to Dashboard</a></p>
            `
        });

        res.status(200).json({
            success: true,
            message: "Charity activated successfully",
            data: charity
        });

    } catch (error) {
        // console.error("Activate charity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to activate charity",
            error: error.message
        });
    }
};

/**
 * @route DELETE /api/admin/charities/:id
 * @desc Delete a charity (hard delete)
 * @access Private (Admin only)
 */
exports.deleteCharity = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid charity ID"
            });
        }

        const charity = await User.findById(id);
        if (!charity || charity.role !== "charity") {
            return res.status(404).json({
                success: false,
                message: "Charity not found"
            });
        }

        // Delete all campaigns
        await Campaign.deleteMany({ charityId: charity._id });

        // Log activity
        await ActivityLog.create({
            userId: req.userId,
            action: `Deleted charity: ${charity.email}`,
            type: "charity_deletion",
            details: { charityId: charity._id }
        });

        await charity.deleteOne();

        res.status(200).json({
            success: true,
            message: "Charity deleted successfully"
        });

    } catch (error) {
        // console.error("Delete charity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete charity",
            error: error.message
        });
    }
};

// ==================== ADMIN STATS ====================

/**
 * @route GET /api/admin/stats
 * @desc Get admin dashboard stats
 * @access Private (Admin only)
 */
exports.getAdminStats = async (req, res) => {
    try {
        const [userStats, campaignStats, donationStats] = await Promise.all([
            // User stats
            User.aggregate([
                {
                    $group: {
                        _id: "$role",
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Campaign stats
            Campaign.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Donation stats
            Donation.aggregate([
                {
                    $group: {
                        _id: null,
                        totalDonations: { $sum: 1 },
                        totalAmount: { $sum: "$amount" },
                        averageAmount: { $avg: "$amount" }
                    }
                }
            ])
        ]);

        // Pending approvals
        const pendingCharities = await User.countDocuments({
            role: "charity",
            isApproved: false,
            isRejected: { $ne: true }
        });

        const pendingCampaigns = await Campaign.countDocuments({
            approvalStatus: "pending"
        });

        res.status(200).json({
            success: true,
            data: {
                users: userStats,
                campaigns: campaignStats,
                donations: donationStats[0] || {
                    totalDonations: 0,
                    totalAmount: 0,
                    averageAmount: 0
                },
                pending: {
                    charities: pendingCharities,
                    campaigns: pendingCampaigns
                }
            }
        });

    } catch (error) {
        // console.error("Get admin stats error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch admin stats",
            error: error.message
        });
    }
};

exports.getPublicStats = async (req, res) => {
    try {
        const [
            totalDonors,
            totalRaised,
            campaignsFunded,
            totalCharities
        ] = await Promise.all([
            User.countDocuments({ role: 'donor', isActive: true }),
            Donation.aggregate([
                { $match: { status: 'Completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Campaign.countDocuments({ status: 'completed' }),
            User.countDocuments({ role: 'charity', isApproved: true, isActive: true })
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalDonors,
                totalRaised: totalRaised[0]?.total || 0,
                campaignsFunded,
                totalCharities
            }
        });
    } catch (error) {
        // console.error('Get public stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch public stats',
            error: error.message
        });
    }
};
const Campaign = require("../../models/CampaignModel");
const Donation = require("../../models/Donation");
const AuthModel = require("../../models/User");
const ActivityLog = require("../../models/ActivityLog");
const { sendEmail } = require("../../utils/emailService");



exports.getDashboardStats = async (req, res) => {
    try {
        const { period = 'month' } = req.query; // day, week, month, year

        // Get date ranges
        const now = new Date();
        let startDate;
        let previousStartDate;

        switch (period) {
            case 'day':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                previousStartDate = new Date(startDate);
                previousStartDate.setDate(previousStartDate.getDate() - 1);
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                previousStartDate = new Date(startDate);
                previousStartDate.setDate(previousStartDate.getDate() - 7);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
                break;
            case 'month':
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                break;
        }

        const endDate = new Date();

        // Get all stats in parallel
        const [
            totalUsers,
            totalCharities,
            totalCampaigns,
            totalDonations,
            totalDonationAmount,
            pendingCharities,
            pendingCampaigns,
            recentDonations,
            recentActivity,
            donationTrend,
            categoryDistribution,
            monthlyDonations,
            topCharities,
            topCampaigns,
            userGrowth
        ] = await Promise.all([
            // Total Users
            AuthModel.countDocuments({ isDeleted: false }),
            
            // Total Charities
            AuthModel.countDocuments({ role: 'charity', isDeleted: false }),
            
            // Total Campaigns
            Campaign.countDocuments({ isDeleted: false }),
            
            // Total Donations
            Donation.countDocuments({ status: 'Completed' }),
            
            // Total Donation Amount
            Donation.aggregate([
                { $match: { status: 'Completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            
            // Pending Charities
            AuthModel.countDocuments({ 
                role: 'charity', 
                isApproved: false, 
                isRejected: { $ne: true } 
            }),
            
            // Pending Campaigns
            Campaign.countDocuments({ approvalStatus: 'pending' }),
            
            // Recent Donations (last 10)
            Donation.find({ status: 'Completed' })
                .sort({ donationDate: -1 })
                .limit(10)
                .populate('donorId', 'fullName email')
                .populate('campaignId', 'title')
                .lean(),
            
            // Recent Activity (last 10)
            ActivityLog.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'fullName email')
                .lean(),
            
            // Donation Trend (last 7 days or 12 months)
            getDonationTrend(period, startDate, endDate),
            
            // Category Distribution
            getCategoryDistribution(),
            
            // Monthly Donations (for chart)
            getMonthlyDonations(period, startDate, endDate),
            
            // Top Charities by donation amount
            getTopCharities(10),
            
            // Top Campaigns by donation amount
            getTopCampaigns(10),
            
            // User Growth (last 12 months)
            getUserGrowth()
        ]);

        // Calculate trend percentages
        const currentPeriodDonations = await getPeriodDonations(startDate, endDate);
        const previousPeriodDonations = await getPeriodDonations(previousStartDate, startDate);
        
        const donationGrowth = previousPeriodDonations > 0 
            ? ((currentPeriodDonations - previousPeriodDonations) / previousPeriodDonations) * 100 
            : 0;

        const totalAmount = totalDonationAmount[0]?.total || 0;

        // Format response
        res.status(200).json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    totalCharities,
                    totalCampaigns,
                    totalDonations,
                    totalAmount,
                    pendingCharities,
                    pendingCampaigns,
                    donationGrowth: Math.round(donationGrowth),
                },
                charts: {
                    donationTrend,
                    categoryDistribution,
                    monthlyDonations,
                    topCharities,
                    topCampaigns,
                    userGrowth,
                },
                recent: {
                    donations: recentDonations,
                    activity: recentActivity,
                }
            }
        });

    } catch (error) {
        console.error("Admin dashboard stats error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard stats",
            error: error.message
        });
    }
}
async function getDonationTrend(period, startDate, endDate) {
    let groupBy;
    let format;

    switch (period) {
        case 'day':
            groupBy = { $hour: '$donationDate' };
            format = '%H:00';
            break;
        case 'week':
            groupBy = { $dayOfWeek: '$donationDate' };
            format = '%A';
            break;
        case 'year':
            groupBy = { $month: '$donationDate' };
            format = '%B';
            break;
        case 'month':
        default:
            groupBy = { $dayOfMonth: '$donationDate' };
            format = '%d';
            break;
    }

    const result = await Donation.aggregate([
        { 
            $match: { 
                status: 'Completed',
                donationDate: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: groupBy,
                amount: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Format labels
    const labels = result.map(item => {
        switch (period) {
            case 'day':
                return `${item._id}:00`;
            case 'week':
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                return days[item._id - 1];
            case 'year':
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return months[item._id - 1];
            default:
                return `${item._id}`;
        }
    });

    return {
        labels,
        amounts: result.map(item => item.amount),
        counts: result.map(item => item.count),
    };
}

async function getCategoryDistribution() {
    const result = await Campaign.aggregate([
        { $match: { isDeleted: false } },
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 },
                totalRaised: { $sum: '$raisedAmount' },
                totalCampaigns: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    return {
        labels: result.map(item => item._id || 'Other'),
        counts: result.map(item => item.count),
        raised: result.map(item => item.totalRaised || 0),
        colors: ['#667eea', '#764ba2', '#2ecc71', '#f39c12', '#e74c3c', '#3498db', '#1abc9c', '#9b59b6', '#e67e22', '#95a5a6']
    };
}

async function getMonthlyDonations(period, startDate, endDate) {
    const result = await Donation.aggregate([
        { 
            $match: { 
                status: 'Completed',
                donationDate: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: { 
                    year: { $year: '$donationDate' },
                    month: { $month: '$donationDate' },
                    day: { $dayOfMonth: '$donationDate' }
                },
                amount: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const labels = result.map(item => {
        const date = new Date(item._id.year, item._id.month - 1, item._id.day);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
        labels: labels.length > 0 ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        amounts: result.map(item => item.amount),
        counts: result.map(item => item.count),
    };
}

async function getPeriodDonations(startDate, endDate) {
    const result = await Donation.aggregate([
        { 
            $match: { 
                status: 'Completed',
                donationDate: { $gte: startDate, $lte: endDate }
            }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result[0]?.total || 0;
}

async function getTopCharities(limit = 10) {
    const result = await Donation.aggregate([
        { $match: { status: 'Completed' } },
        {
            $group: {
                _id: '$charityId',
                totalAmount: { $sum: '$amount' },
                totalDonations: { $sum: 1 },
                avgAmount: { $avg: '$amount' }
            }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'charity'
            }
        },
        { $unwind: { path: '$charity', preserveNullAndEmptyArrays: true } }
    ]);

    return result.map(item => ({
        name: item.charity?.charityDetails?.organizationName || item.charity?.fullName || 'Unknown',
        totalAmount: item.totalAmount,
        totalDonations: item.totalDonations,
        avgAmount: item.avgAmount,
    }));
}

async function getTopCampaigns(limit = 10) {
    const result = await Donation.aggregate([
        { $match: { status: 'Completed' } },
        {
            $group: {
                _id: '$campaignId',
                totalAmount: { $sum: '$amount' },
                totalDonations: { $sum: 1 },
                avgAmount: { $avg: '$amount' }
            }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'campaigns',
                localField: '_id',
                foreignField: '_id',
                as: 'campaign'
            }
        },
        { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } }
    ]);

    return result.map(item => ({
        name: item.campaign?.title || 'Unknown',
        totalAmount: item.totalAmount,
        totalDonations: item.totalDonations,
        avgAmount: item.avgAmount,
        goalAmount: item.campaign?.goalAmount || 0,
        progress: item.campaign?.goalAmount ? (item.totalAmount / item.campaign.goalAmount) * 100 : 0,
    }));
}

async function getUserGrowth() {
    const result = await AuthModel.aggregate([
        {
            $group: {
                _id: { 
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 }
    ]);

    const labels = result.map(item => {
        const date = new Date(item._id.year, item._id.month - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return {
        labels: labels.length > 0 ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        counts: result.map(item => item.count),
    };
}

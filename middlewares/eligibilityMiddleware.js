const Verification = require("../models/Verification");
const User = require('../models/User');
const { createVerificationRecord, checkEligibility } = require("../services/verificationService");


const ensureVerificationRecord = async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    
    if (user && user.role === 'charity') {
      // Check if verification record exists
      const verification = await Verification.findOne({ charityId: userId });
      if (!verification) {
        // Create verification record if missing
        await createVerificationRecord(userId);
      }
    }
    next();
  } catch (error) {
    //console.error('Ensure verification record error:', error);
    next();
  }
};
const checkCharityEligibility = async (req, res, next) => {
  try {
    const charityId = req.userId;
    
    
    const charity = await User.findById(charityId);
    if (!charity || charity.role !== 'charity') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Charity only.',
      });
    }

    
    if (!charity.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your charity is not approved yet. Please wait for admin approval.',
        data: {
          status: 'pending_approval',
        },
      });
    }

    
    if (!charity.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Your charity is not verified yet. Please complete document verification.',
        data: {
          status: 'pending_verification',
          redirect: '/charity/documents',
        },
      });
    }

    
    const eligibility = await checkEligibility(charityId);
    if (!eligibility.isEligible) {
      return res.status(403).json({
        success: false,
        message: eligibility.reason || 'Your charity is not eligible for fundraising.',
        data: {
          status: 'not_eligible',
          missingDocs: eligibility.missingDocs,
          progress: eligibility.progress,
          redirect: '/charity/documents',
        },
      });
    }

    req.eligibility = eligibility;
    req.charity = charity;
    next();
  } catch (error) {
    //console.error('Eligibility check middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check eligibility',
      error: error.message,
    });
  }
};

module.exports = {
  checkCharityEligibility,
  ensureVerificationRecord
};
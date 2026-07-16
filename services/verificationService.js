const Verification = require("../models/Verification");
const User = require('../models/User');
const mongoose = require('mongoose');

const DOCUMENT_REQUIREMENTS = [
  {
    id: 'certificateOfIncorporation',
    label: 'Certificate of Incorporation / NGO Registration Certificate',
    description: 'Proves legal existence of your organization',
    required: true,
  },
  {
    id: 'taxExemptionCertificate',
    label: 'Tax Exemption Certificate (e.g., 501(c)(3), 12A/80G)',
    description: 'Proves tax-exempt/nonprofit status',
    required: true,
  },
  {
    id: 'panNumber',
    label: 'PAN / Tax Identification Number',
    description: 'Financial identity verification',
    required: true,
  },
  {
    id: 'trustDeed',
    label: 'Trust Deed / MOA & AOA',
    description: 'Defines governance structure & purpose',
    required: true,
  },
  {
    id: 'authorizedSignatoryId',
    label: 'Government-issued ID of authorized signatory',
    description: 'Verifies the person representing the organization',
    required: true,
  },
  {
    id: 'proofOfAddress',
    label: 'Proof of registered address',
    description: 'Confirms physical presence of the organization',
    required: true,
  },
  {
    id: 'bankAccountProof',
    label: 'Cancelled cheque / Bank account proof',
    description: 'Confirms fund destination matches organization name',
    required: true,
  },
  {
    id: 'auditedFinancials',
    label: 'Audited financial statements (last 1-3 years)',
    description: 'Financial transparency and accountability',
    required: true,
  },
  {
    id: 'boardMembersList',
    label: 'List of board members/trustees',
    description: 'Governance transparency',
    required: true,
  },
  {
    id: 'annualReport',
    label: 'Annual report (if available)',
    description: 'Track record of activities and achievements',
    required: false,
  },
  {
    id: 'pastWorkPhotos',
    label: 'Photos/proof of past work or ongoing projects',
    description: 'Credibility boost (optional)',
    required: false,
  },
];

/**
 * Create verification record for a charity
 * @param {string} charityId - Charity user ID
 * @returns {Object} - Created verification record
 */
const createVerificationRecord = async (charityId) => {
  try {
    // Check if verification record already exists
    const existing = await Verification.findOne({ charityId });
    if (existing) {
      return existing;
    }

    
    const documents = DOCUMENT_REQUIREMENTS.map(doc => ({
      documentId: doc.id,
      label: doc.label,
      description: doc.description,
      required: doc.required,
      status: 'pending', // All documents start as pending
      fileUrl: null,
      uploadedAt: null,
      verifiedAt: null,
      verifiedBy: null,
      adminNotes: null,
    }));

    const verification = new Verification({
      charityId,
      documents,
      status: 'pending',
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      feedback: null,
    });

    await verification.save();

    await User.findByIdAndUpdate(charityId, {
      verificationId: verification._id,
    });

    return verification;

  } catch (error) {
    //console.error('Create verification record error:', error);
    throw error;
  }
};


/**
 * Check if charity is eligible for fundraising
 * @param {string} charityId - Charity user ID
 * @returns {Object} - Eligibility status
 */
const checkEligibility = async (charityId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(charityId)) {
      //console.error(`Invalid charityId passed to checkEligibility: ${charityId}`);
      return {
        isEligible: false,
        reason: 'Invalid Charity ID provided.',
        missingDocs: [],
        progress: 0,
      };
    }
    
    const verification = await Verification.findOne({ charityId });
    
    if (!verification) {
      return {
        isEligible: false,
        reason: 'No verification record found. Please complete the verification process.',
        missingDocs: DOCUMENT_REQUIREMENTS.filter(d => d.required).map(d => d.label),
        progress: 0,
      };
    }

    // Get charity details
    const charity = await User.findById(charityId);
    if (!charity) {
      return {
        isEligible: false,
        reason: 'Charity not found',
        missingDocs: [],
        progress: 0,
      };
    }

    // Check if charity is already approved
    if (charity.isApproved && charity.isVerified) {
      return {
        isEligible: true,
        reason: 'Charity is already verified and approved.',
        missingDocs: [],
        progress: 100,
      };
    }

    // Check document status
    const requiredDocs = verification.documents.filter(d => d.required);
    const verifiedDocs = requiredDocs.filter(d => d.status === 'verified');
    const rejectedDocs = requiredDocs.filter(d => d.status === 'rejected');
    const pendingDocs = requiredDocs.filter(d => d.status === 'pending' || d.status === 'submitted');
    
    // Check if all required documents are verified
    const allVerified = requiredDocs.length > 0 && 
                        verifiedDocs.length === requiredDocs.length && 
                        rejectedDocs.length === 0;

    // Check if any document is rejected
    const hasRejected = rejectedDocs.length > 0;

    // Calculate progress
    const progress = (verifiedDocs.length / requiredDocs.length) * 100;

    // Determine eligibility
    let isEligible = false;
    let reason = '';
    let missingDocs = [];

    if (allVerified) {
      // All required documents are verified
      isEligible = true;
      reason = 'All required documents are verified and approved.';
    } else if (hasRejected) {
      // Some documents are rejected
      isEligible = false;
      reason = `${rejectedDocs.length} document(s) have been rejected. Please review and re-upload.`;
      missingDocs = rejectedDocs.map(d => d.label);
    } else if (pendingDocs.length > 0) {
      // Some documents are still pending
      isEligible = false;
      reason = `${pendingDocs.length} document(s) are pending verification.`;
      missingDocs = pendingDocs.map(d => d.label);
    } else {
      // No documents uploaded
      isEligible = false;
      reason = 'Please upload all required documents for verification.';
      missingDocs = requiredDocs.map(d => d.label);
    }

    return {
      isEligible,
      reason,
      missingDocs,
      progress: Math.round(progress),
      verifiedCount: verifiedDocs.length,
      totalRequired: requiredDocs.length,
      rejectedCount: rejectedDocs.length,
      pendingCount: pendingDocs.length,
    };

  } catch (error) {
    //console.error('Check eligibility error:', error);
    return {
      isEligible: false,
      reason: 'Failed to check eligibility. Please try again.',
      missingDocs: [],
      progress: 0,
    };
  }
};

module.exports = {
  checkEligibility,
  createVerificationRecord,
  DOCUMENT_REQUIREMENTS,
};

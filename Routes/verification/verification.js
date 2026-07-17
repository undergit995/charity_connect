const express = require('express');
const router = express.Router();
const {authAndRole} = require('../../middlewares/auth.js');
const {uploadDocument} = require('../../config/multerConfig.js');
const User = require('../../models/User.js');
const Verification = require('../../models/Verification.js');
const { checkEligibility, DOCUMENT_REQUIREMENTS } = require('../../services/verificationService.js');

/**
 * @route GET /api/verification/status/:charityId
 * @desc Get verification status
 * @access Private
 */
router.get('/status/:charityId', async (req, res) => {
  try {
    const { charityId } = req.params;    
    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      // Initialize verification record
      const newVerification = new Verification({
        charityId,
        documents: DOCUMENT_REQUIREMENTS.map(doc => ({
          documentId: doc.id,
          label: doc.label,
          description: doc.description,
          status: 'pending',
          required: doc.required,
        })),
        status: 'pending',
      });
      await newVerification.save();
      
      return res.status(200).json({
        success: true,
        data: {
          documents: newVerification.documents,
          status: 'pending',
          eligibility: {
            isEligible: false,
            missingDocs: DOCUMENT_REQUIREMENTS.filter(d => d.required).map(d => d.label),
            progress: 0,
          },
        },
      });
    }

    // Calculate eligibility
    const requiredDocs = verification.documents.filter(d => d.required);
    const verifiedDocs = requiredDocs.filter(d => d.status === 'verified');
    const rejectedDocs = requiredDocs.filter(d => d.status === 'rejected');
    const missingDocs = requiredDocs.filter(d => d.status === 'pending' || d.status === 'needs-info');

    const isEligible = verifiedDocs.length === requiredDocs.length && rejectedDocs.length === 0;
    const progress = (verifiedDocs.length / requiredDocs.length) * 100;

    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://charity-connect-p2t3.onrender.com' 
      : `${req.protocol}://${req.get('host')}`;

    const formattedDocuments = verification.documents.map(doc => {
      const docObj = doc.toObject();
      if (docObj.fileUrl && !docObj.fileUrl.startsWith('http')) {
        docObj.fileUrl = `${baseUrl}/${docObj.fileUrl.replace(/\\/g, '/')}`;
      }
      return docObj;
    });
    res.status(200).json({
      success: true,
      data: {
        documents: formattedDocuments,
        status: verification.status,
        eligibility: {
          isEligible,
          missingDocs: missingDocs.map(d => d.label),
          progress,
        },
      },
    });
  } catch (error) {
    //console.error('Get verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get verification status',
    });
  }
});

/**
 * @route GET /api/verification/pending
 * @desc Get all pending verifications for admin
 * @access Private (Admin only)
 */
router.get('/pending', authAndRole('admin'), async (req, res) => {
  try {
    // Check if user is admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = 'all' 
    } = req.query;

    // Build query
    let query = {};

    // Filter by status
    if (status === 'pending') {
      query.status = 'pending';
    } else if (status === 'submitted') {
      query.status = 'submitted';
    } else if (status === 'verified') {
      query.status = 'verified';
    } else if (status === 'rejected') {
      query.status = 'rejected';
    } else if (status === 'needs-info') {
      query.status = 'needs-info';
    }
    // 'all' - no status filter

    // Search by charity name or email
    if (search) {
      // First find charities matching search
      const matchingCharities = await User.find({
        role: 'charity',
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { 'charityDetails.organizationName': { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const charityIds = matchingCharities.map(c => c._id);
      query.charityId = { $in: charityIds };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get verifications with pagination
    const [verifications, total] = await Promise.all([
      Verification.find(query)
        .populate('charityId', 'fullName email phone profileImage address charityDetails isApproved isVerified')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      Verification.countDocuments(query),
    ]);

    // Get statistics
    const stats = await Verification.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          submitted: {
            $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] },
          },
          verified: {
            $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
          },
          'needs-info': {
            $sum: { $cond: [{ $eq: ['$status', 'needs-info'] }, 1, 0] },
          },
        },
      },
    ]);

    // Format response
    const formattedVerifications = verifications.map((verification) => {
      const charity = verification.charityId || {};
      const docStats = {
        total: verification.documents?.length || 0,
        verified: verification.documents?.filter(d => d.status === 'verified').length || 0,
        rejected: verification.documents?.filter(d => d.status === 'rejected').length || 0,
        pending: verification.documents?.filter(d => d.status === 'pending' || d.status === 'submitted').length || 0,
      };

      return {
        _id: verification._id,
        charityId: charity._id,
        fullName: charity.fullName,
        email: charity.email,
        phone: charity.phone,
        profileImage: charity.profileImage,
        address: charity.address,
        charityDetails: charity.charityDetails,
        isApproved: charity.isApproved,
        isVerified: charity.isVerified,
        documents: verification.documents || [],
        verificationStatus: verification.status,
        documentsStats: docStats,
        createdAt: verification.createdAt,
        updatedAt: verification.updatedAt,
        submittedAt: verification.submittedAt,
        reviewedAt: verification.reviewedAt,
        feedback: verification.feedback,
      };
    });

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      submitted: 0,
      verified: 0,
      rejected: 0,
      'needs-info': 0,
    };

    res.status(200).json({
      success: true,
      data: formattedVerifications,
      stats: statsData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    //console.error('Get pending verifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending verifications',
      error: error.message,
    });
  }
});


/**
 * @route PUT /api/verification/documents/:charityId/fraud_review
 * @desc Update fraud review document
 * @access Private (Admin only)
 */
router.put('/documents/:charityId/fraud_review', authAndRole('admin'), async (req, res) => {
  try {
    const { charityId } = req.params;
    const { status, adminNotes } = req.body;

    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    // Find verification record
    let verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    // Find or create fraud review document
    let fraudDoc = verification.documents.find(d => d.documentId === 'fraud_review');
    
    if (!fraudDoc) {
      // Create fraud review document
      verification.documents.push({
        documentId: 'fraud_review',
        label: 'Fraud & Legitimacy Review',
        description: 'Admin fraud and legitimacy review report',
        required: false,
        status: status || 'pending',
        adminNotes: adminNotes || '',
        verifiedAt: status === 'verified' ? new Date() : null,
        verifiedBy: status === 'verified' ? req.userId : null,
        uploadedAt: new Date(),
      });
    } else {
      // Update existing fraud review
      fraudDoc.status = status || fraudDoc.status;
      fraudDoc.adminNotes = adminNotes || fraudDoc.adminNotes;
      if (status === 'verified') {
        fraudDoc.verifiedAt = new Date();
        fraudDoc.verifiedBy = req.userId;
      }
      fraudDoc.uploadedAt = new Date();
    }

    await verification.save();

    res.status(200).json({
      success: true,
      message: 'Fraud review updated successfully',
      data: verification,
    });
  } catch (error) {
    //console.error('Update fraud review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update fraud review',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/verification/eligibility/:charityId
 * @desc Check charity eligibility for fundraising
 * @access Private (Charity/Admin)
 */
router.get('/eligibility/:charityId', async (req, res) => {
  try {
    const { charityId } = req.params;
    
    // Check authorization
    const user = await User.findById(req.userId);
    const isAdmin = user?.role === 'admin';
    const isOwner = charityId === req.userId;
    
    // if (!isAdmin && !isOwner) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Access denied',
    //   });
    // }

    const eligibility = await checkEligibility(charityId);
    
    res.status(200).json({
      success: true,
      data: eligibility,
    });
  } catch (error) {
    //console.error('Eligibility check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check eligibility',
      error: error.message,
    });
  }
});


/**
 * @route POST /api/verification/upload/:charityId
 * @desc Upload document
 * @access Private
 */
router.post('/upload/:charityId', authAndRole('charity'), uploadDocument, async (req, res) => {
  try {
    const { charityId } = req.params;
    const { documentType, fieldsData } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    // Update document status
    const document = verification.documents.find(d => d.documentId === documentType);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document type not found',
      });
    }

    const relativePath = req.file.path.replace(/\\/g, '/');
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://charity-connect-p2t3.onrender.com' 
      : `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/${relativePath}`;

    document.status = 'submitted';
    document.fileUrl = fileUrl;
    document.uploadedAt = new Date();

    // Save additional fields if provided
    if (fieldsData) {
      document.fieldsData = { ...document.fieldsData, ...JSON.parse(fieldsData) };
    }

    // Update verification status
    if (verification.status === 'pending') {
      verification.status = 'needs-info';
    }

    await verification.save();

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        fileUrl: fileUrl,
        status: 'submitted',
      },
    });
  } catch (error) {
    //console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
    });
  }
});

/**
 * @route PUT /api/verification/documents/:charityId/:documentId
 * @desc Admin verify document
 * @access Private (Admin only)
 */
router.put('/documents/:charityId/:documentId', authAndRole('admin'), async (req, res) => {
  try {
    const { charityId, documentId } = req.params;
    const { status, notes } = req.body;

    // Check if user is admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    const document = verification.documents.find(d => d.documentId === documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    document.status = status;
    document.adminNotes = notes;
    document.verifiedAt = new Date();
    document.verifiedBy = req.userId;

    // Update verification status
    const allVerified = verification.documents.every(d => d.status === 'verified');
    const anyRejected = verification.documents.some(d => d.status === 'rejected');

    if (allVerified) {
      verification.status = 'verified';
    } else if (anyRejected) {
      verification.status = 'rejected';
    } else {
      verification.status = 'submitted';
    }

    await verification.save();

    // If all documents are verified, update charity status
    if (allVerified) {
      await User.findByIdAndUpdate(charityId, {
        isApproved: true,
        isVerified: true,
        verifiedAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: {
        status,
        verificationStatus: verification.status,
      },
    });
  } catch (error) {
    //console.error('Verify document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify document',
    });
  }
});

/**
 * @route PUT /api/verification/documents/:charityId/verify-all
 * @desc Admin verify all documents
 * @access Private (Admin only)
 */
router.put('/documents/:charityId/verify-all', authAndRole('admin'), async (req, res) => {
  try {
    const { charityId } = req.params;

    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    // Verify all pending/submitted documents
    verification.documents.forEach(doc => {
      if (doc.status === 'pending' || doc.status === 'submitted' || doc.status === 'needs-info') {
        doc.status = 'verified';
        doc.verifiedAt = new Date();
        doc.verifiedBy = req.userId;
      }
    });

    verification.status = 'verified';
    await verification.save();

    // Update charity status
    await User.findByIdAndUpdate(charityId, {
      isApproved: true,
      isVerified: true,
      verifiedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'All documents verified successfully',
    });
  } catch (error) {
    //console.error('Verify all documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify all documents',
    });
  }
});

// routes/verificationRoutes.js

/**
 * @route GET /api/verification/documents/:charityId/:documentId/view
 * @desc Get document for viewing
 * @access Private (Admin only)
 */
router.get('/documents/:charityId/:documentId/view', authAndRole('admin'), async (req, res) => {
  try {
    const { charityId, documentId } = req.params;

    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    // Find verification record
    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    // Find document
    const document = verification.documents.find(d => d.documentId === documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    if (!document.fileUrl) {
      return res.status(404).json({
        success: false,
        message: 'Document not uploaded yet',
      });
    }

    
    res.status(200).json({
      success: true,
      data: {
        documentId: document.documentId,
        label: document.label,
        fileUrl: document.fileUrl,
        status: document.status,
        uploadedAt: document.uploadedAt,
        verifiedAt: document.verifiedAt,
        adminNotes: document.adminNotes,
      },
    });
  } catch (error) {
    //console.error('View document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to view document',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/verification/documents/:charityId/:documentId
 * @desc Get a single document's details for viewing
 * @access Private (Admin only)
 */
router.get('/documents/:charityId/:documentId', authAndRole('admin'), async (req, res) => {
  try {
    const { charityId, documentId } = req.params;

    // Find verification record
    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    // Find document
    const document = verification.documents.find(d => d.documentId === documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    if (!document.fileUrl) {
      return res.status(404).json({
        success: false,
        message: 'Document not uploaded yet',
      });
    }

    // Ensure fileUrl uses forward slashes for compatibility
    const relativePath = document.fileUrl.replace(/\\/g, '/');
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://charity-connect-p2t3.onrender.com'
      : `${req.protocol}://${req.get('host')}`;
    const fullFileUrl = relativePath.startsWith(baseUrl) ? relativePath : `${baseUrl}/${relativePath}`;

    res.status(200).json({
      success: true,
      data: {
        documentId: document.documentId,
        label: document.label,
        fileUrl: fullFileUrl,
        status: document.status,
        uploadedAt: document.uploadedAt,
        verifiedAt: document.verifiedAt,
        adminNotes: document.adminNotes,
      },
    });
  } catch (error) {
    //console.error('View document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to view document',
      error: error.message,
    });
  }
});


/**
 * @route POST /api/verification/submit/:charityId
 * @desc Submit for verification
 * @access Private
 */
router.post('/submit/:charityId', authAndRole('charity'), async (req, res) => {
  try {
    const { charityId } = req.params;

    const verification = await Verification.findOne({ charityId });
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found',
      });
    }

    // Check if all required documents are submitted
    const requiredDocs = verification.documents.filter(d => d.required);
    const allSubmitted = requiredDocs.every(d => d.status !== 'pending');

    if (!allSubmitted) {
      return res.status(400).json({
        success: false,
        message: 'Please upload all required documents before submitting',
      });
    }

    verification.status = 'submitted';
    verification.submittedAt = new Date();
    await verification.save();

    // Notify admins (implement email notification)
    // ...

    res.status(200).json({
      success: true,
      message: 'Application submitted for verification',
    });
  } catch (error) {
    //console.error('Submit verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit verification',
    });
  }
});

module.exports = router;
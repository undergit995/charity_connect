const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directories exist
const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Determine folder based on file type
    if (file.fieldname === 'profileImage' || file.fieldname === 'avatar') {
      uploadPath += 'profiles/';
    } else if (file.fieldname === 'coverImage' || file.fieldname === 'banner') {
      uploadPath += 'covers/';
    } else if (file.fieldname === 'campaignImage' || file.fieldname === 'campaignImages') {
      uploadPath += 'campaigns/';
    } else if (file.fieldname === 'document' || file.fieldname === 'certificate') {
      uploadPath += 'documents/';
    } else if (file.fieldname === 'receipt') {
      uploadPath += 'receipts/';
    } else {
      uploadPath += 'misc/';
    }

    // Create directory if it doesn't exist
    ensureDirectoryExists(uploadPath);
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    const sanitizedName = path.basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    
    cb(null, `${sanitizedName}_${uniqueId}${extension}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const imageTypes = /jpeg|jpg|png|gif|webp|svg/;
  const documentTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt/;
  const allTypes = /jpeg|jpg|png|gif|webp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt/;

  let isAllowed = false;
  let errorMessage = '';

  // Check if it's an image
  if (file.fieldname === 'profileImage' || 
      file.fieldname === 'avatar' || 
      file.fieldname === 'coverImage' || 
      file.fieldname === 'banner' || 
      file.fieldname === 'campaignImage' || 
      file.fieldname === 'campaignImages') {
    isAllowed = imageTypes.test(path.extname(file.originalname).toLowerCase());
    errorMessage = 'Only image files are allowed for this field';
  } 
  // Check if it's a document
  else if (file.fieldname === 'document' || 
           file.fieldname === 'certificate') {
    isAllowed = documentTypes.test(path.extname(file.originalname).toLowerCase());
    errorMessage = 'Only document files (PDF, Word, Excel, PPT) are allowed';
  } 
  // General upload
  else {
    isAllowed = allTypes.test(path.extname(file.originalname).toLowerCase());
    errorMessage = 'Invalid file type';
  }

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error(errorMessage), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, 
    files: 10, // Max 10 files per request
  },
  fileFilter: fileFilter,
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({
        success: false,
        message: 'File is too large. Maximum size is 10MB.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.',
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  next();
};

// ==================== UPLOAD CONFIGURATIONS ====================

// Single file upload
const uploadSingle = (fieldName) => {
  return [upload.single(fieldName), handleMulterError];
};

// Multiple files upload (same field)
const uploadMultiple = (fieldName, maxCount = 5) => {
  return [upload.array(fieldName, maxCount), handleMulterError];
};

// Multiple fields upload
const uploadFields = (fields) => {
  return [upload.fields(fields), handleMulterError];
};

// ==================== SPECIFIC UPLOAD CONFIGURATIONS ====================

// Profile image upload (single)
const uploadProfileImage = uploadSingle('profileImage');

// Cover image upload (single)
const uploadCoverImage = uploadSingle('coverImage');

// Campaign images upload (multiple)
const uploadCampaignImages = uploadMultiple('campaignImages', 5);

// Document upload (single)
const uploadDocument = uploadSingle('document');

// Receipt upload (single)
const uploadReceipt = uploadSingle('receipt');

// Multiple image upload with different fields
const uploadCampaignMedia = uploadFields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'campaignImages', maxCount: 10 },
  { name: 'documents', maxCount: 3 },
]);

// ==================== HELPER FUNCTIONS ====================

// Get file URL
const getFileUrl = (req, filePath) => {
  if (!filePath) return null;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  // The path from multer is like 'uploads\\profiles\\image.jpg', so we need to make it a valid URL path.
  const urlPath = filePath.replace(/\\/g, '/').replace('uploads/', '');
  return `${baseUrl}/uploads/${urlPath}`;
};

// Delete file
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Get file info
const getFileInfo = (file) => {
  if (!file) return null;
  return {
    filename: file.filename,
    originalName: file.originalname,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    url: file.path ? `/uploads/${file.path.split('uploads/')[1]}` : null,
  };
};

// ==================== EXPORTS ====================

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadProfileImage,
  uploadCoverImage,
  uploadCampaignImages,
  uploadDocument,
  uploadReceipt,
  uploadCampaignMedia,
  handleMulterError,
  getFileUrl,
  deleteFile,
  getFileInfo,
};
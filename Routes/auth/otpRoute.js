const express = require('express');
const router = express.Router();
const otpService = require('../../utils/otpService');
const { validateEmail, validatePhone } = require('../../utils/validators');
const { rateLimit } = require('express-rate-limit');

// Rate limiting for OTP requests
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again later.',
  },
});

/**
 * @route POST /api/otp/send-email
 * @desc Send OTP to email
 * @access Public
 */
router.post('/send-email', otpRateLimiter, async (req, res) => {
  try {
    const { email, purpose = 'verification' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    const result = await otpService.sendOTPEmail(email, purpose);
    
    res.status(200).json({
      success: true,
      message: result.message,
      otpId: result.otpId,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    console.error('Send OTP email error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP',
    });
  }
});

// /**
//  * @route POST /api/otp/send-phone
//  * @desc Send OTP to phone
//  * @access Public
//  */
// router.post('/send-phone', otpRateLimiter, async (req, res) => {
//   try {
//     const { phone, purpose = 'verification' } = req.body;

//     if (!phone) {
//       return res.status(400).json({
//         success: false,
//         message: 'Phone number is required',
//       });
//     }

//     if (!validatePhone(phone)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid phone number format',
//       });
//     }

//     const result = await otpService.sendOTPSMS(phone, purpose);
    
//     res.status(200).json({
//       success: true,
//       message: result.message,
//       otpId: result.otpId,
//       expiresIn: result.expiresIn,
//     });
//   } catch (error) {
//     console.error('Send OTP SMS error:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to send OTP',
//     });
//   }
// });

/**
 * @route POST /api/otp/verify
 * @desc Verify OTP
 * @access Public
 */
router.post('/verify', async (req, res) => {
  try {
    const { identifier, otp, purpose = 'verification' } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Identifier and OTP are required',
      });
    }

    const result = otpService.verifyOTP(identifier, otp, purpose);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      identifier: result.identifier,
      purpose: result.purpose,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
    });
  }
});

/**
 * @route POST /api/otp/resend
 * @desc Resend OTP
 * @access Public
 */
router.post('/resend', otpRateLimiter, async (req, res) => {
  try {
    const { identifier, type = 'email', purpose = 'verification' } = req.body;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Identifier is required',
      });
    }

    const result = await otpService.resendOTP(identifier, type, purpose);
    
    res.status(200).json({
      success: true,
      message: result.message,
      otpId: result.otpId,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend OTP',
    });
  }
});



router.get('/status/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Identifier is required',
      });
    }

    const status = otpService.getOTPStatus(identifier);
    
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Get OTP status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get OTP status',
    });
  }
});



router.post('/verify-and-register', async (req, res) => {
  try {
    const { identifier, otp, userData, purpose = 'verification' } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Identifier and OTP are required',
      });
    }

    // Verify OTP
    const result = otpService.verifyOTP(identifier, otp, purpose);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }


    res.status(200).json({
      success: true,
      message: 'OTP verified and user registered successfully',
      // user,
    });
  } catch (error) {
    console.error('Verify and register error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP and register user',
    });
  }
});

module.exports = router;
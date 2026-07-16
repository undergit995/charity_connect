const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const otpController = require('../../Controllers/AuthController/otpController');

// Rate limiting for OTP requests
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
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
router.post('/send-email', otpRateLimiter, otpController.sendEmailOtp);

/**
 * @route POST /api/otp/verify
 * @desc Verify OTP
 * @access Public
 */
router.post('/verify', otpController.verifyOtp);

/**
 * @route POST /api/otp/resend
 * @desc Resend OTP
 * @access Public
 */
router.post('/resend', otpRateLimiter, otpController.resendOtp);

router.get('/status/:identifier', otpController.getOtpStatus);
router.post('/verify-and-register', otpController.verifyAndRegister);

module.exports = router;
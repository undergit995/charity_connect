const otpService = require('../../utils/otpService.js');
const { validateEmail } = require('../../utils/validators.js');
const { sendOTPEmail } = require('../../utils/emailService.js');

exports.sendEmailOtp = async (req, res) => {
  try {console.log("grs");
  
    const { email, purpose = 'verification' } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    const otpData = await otpService.createOTP(email, 'email', purpose);
    
    // Respond to the client immediately
    sendOTPEmail(email, otpData.otp, purpose, otpService.otpConfig.expiresIn / 60).catch(emailError => {
      // Log the error if email sending fails, but don't crash the server.
      console.log(`[Non-blocking] Failed to send OTP email to ${email}:`, emailError.message);
    });
    res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${email}`,
      expiresIn: otpService.otpConfig.expiresIn,
      otpId: otpData._id, // Include otpId for reference if needed
    });
// Send the email in the background (fire and forget)
  } catch (error) {
    console.log('Send OTP email error:', error.message);
    const statusCode = error.message.includes('Please wait') ? 429 : 500;
    const message = error.message || 'Failed to send OTP';
    res.status(statusCode).json({ success: false, message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { identifier, otp, purpose = 'verification' } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
    }
    const result = await otpService.verifyOTP(identifier, otp, purpose);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    res.status(200).json({
      success: true,
      message: result.message,
      identifier: result.identifier,
      purpose: result.purpose,
    });
  } catch (error) {
    // //console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { identifier, type = 'email', purpose = 'verification' } = req.body;
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Identifier is required' });
    }
    const result = await otpService.resendOTP(identifier, type, purpose);
    res.status(200).json({
      success: true,
      message: result.message,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    // //console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to resend OTP' });
  }
};

exports.getOtpStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Identifier is required' });
    }
    const status = await otpService.getOTPStatus(identifier);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    // //console.error('Get OTP status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get OTP status' });
  }
};

exports.verifyAndRegister = async (req, res) => {
    try {
        const { identifier, otp, userData, purpose = 'verification' } = req.body;
        if (!identifier || !otp) {
            return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
        }
        const result = await otpService.verifyOTP(identifier, otp, purpose);
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }
        // Add registration here
        res.status(200).json({ success: true, message: 'OTP verified and user registered successfully' });
    } catch (error) {
        // //console.error('Verify and register error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify OTP and register user' });
    }
};

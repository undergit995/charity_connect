const otpGenerator = require('otp-generator');
const { sendEmail } = require('./emailService');
const logger = require('./logger');
const Otp = require('../models/Otp');

class OTPService {
  constructor() {
    // The otpStore Map is no longer needed and will be removed.
    this.otpConfig = {
      length: 6,
      expiresIn: 300, // 5 minutes
      maxAttempts: 3,
      resendCooldown: 60, // 1 minute
      digits: true,
      alphabets: false,
      upperCase: false,
      specialChars: false,
    };
  }

  
  generateOTP(length = this.otpConfig.length) {
    return otpGenerator.generate(length, {
      digits: this.otpConfig.digits,
      alphabets: this.otpConfig.alphabets,
      upperCase: this.otpConfig.upperCase,
      specialChars: this.otpConfig.specialChars,
    });
  }

  /**
   * Create and store OTP
   * @param {string} identifier - Email or phone number
   * @param {string} type - 'email' or 'phone'
   * @param {string} purpose - 'verification', 'login', 'reset-password'
   * @returns {Object} - OTP details
   */
  async createOTP(identifier, type = 'email', purpose = 'verification') {
    try {
      const existing = await Otp.findOne({ identifier, purpose });
      if (existing) {
        const timeSinceCreation = Date.now() - new Date(existing.createdAt).getTime();
        if (timeSinceCreation < this.otpConfig.resendCooldown * 1000) {
          throw new Error(`Please wait ${this.otpConfig.resendCooldown} seconds before requesting a new OTP`);
        }
        // Delete old OTP to generate a new one
        await Otp.deleteOne({ _id: existing._id });
      }

      const otp = this.generateOTP();
      const expiresAt = new Date(Date.now() + this.otpConfig.expiresIn * 1000);

      const newOtp = new Otp({
        identifier,
        otp,
        purpose,
        expiresAt,
      });

      await newOtp.save();
      return newOtp.toObject();
    } catch (error) {
      logger.error('Error creating OTP:', error.message);
      throw new Error('Failed to create OTP');
    }
  }

  /**
   * Verify OTP
   * @param {string} identifier - Email or phone number
   * @param {string} otp - OTP to verify
   * @param {string} purpose - 'verification', 'login', 'reset-password'
   * @returns {Object} - Verification result
   */
  async verifyOTP(identifier, otp, purpose = 'verification') {
    const otpRecord = await Otp.findOne({ identifier, purpose });

    if (!otpRecord) {
      return {
        success: false,
        message: 'OTP not found or expired. Please request a new one.',
      };
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return {
        success: false,
        message: 'OTP has expired. Please request a new one.',
      };
    }

    if (otpRecord.attempts >= this.otpConfig.maxAttempts) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return {
        success: false,
        message: 'Maximum attempts exceeded. Please request a new OTP.',
      };
    }

    if (otpRecord.otp !== otp) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return {
        success: false,
        message: `Invalid OTP. ${this.otpConfig.maxAttempts - otpRecord.attempts} attempts remaining.`,
      };
    }

    // OTP is correct
    await Otp.deleteOne({ _id: otpRecord._id });

    return {
      success: true,
      message: 'OTP verified successfully!',
      identifier: otpRecord.identifier,
      purpose: otpRecord.purpose,
    };
  }

  /**
   * Send OTP via email
   * @param {string} email - Email address
   * @param {string} purpose - Purpose of OTP
   * @param {Object} options - Additional options
   * @returns {Object} - Result
   */
  async sendOTPEmail(email, purpose = 'verification', options = {}) {
    try {
      // This function now primarily creates the OTP. The sending is handled by the controller.
      const otpData = await this.createOTP(email, 'email', purpose);

      return {
        success: true,
        message: `OTP sent to your email for ${purpose}`,
        otp: otpData.otp, // Return the OTP to be sent by the controller
        expiresIn: this.otpConfig.expiresIn,
      };
    } catch (error) {
      logger.error('Error sending OTP email:', error);
      throw new Error('Failed to send OTP email');
    }
  }

  /**
   * Get email template
   * @param {string} otp - OTP code
   * @param {string} purpose - Purpose of OTP
   * @returns {string} - HTML email template
   */
  getEmailTemplate(otp, purpose, data = {}) {
    const purposeMap = {
      verification: 'Verify your email address',
      login: 'Secure login verification',
      'reset-password': 'Password reset verification',
    };
    const { expiresIn = 5 } = data;
    const purposeText = purposeMap[purpose] || 'Verification';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .otp-box { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; border: 2px dashed #667eea; }
            .otp-code { font-size: 36px; font-weight: 700; color: #667eea; letter-spacing: 8px; }
            .info { color: #6c757d; font-size: 14px; line-height: 1.6; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">❤️ CharityConnect</div>
              <h2>${purposeText}</h2>
            </div>
            <p>Hello,</p>
            <p>You've requested to ${purposeText.toLowerCase()}. Use the OTP below to complete your request:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p class="info">This OTP is valid for <strong>${expiresIn} minutes</strong>. Do not share this code with anyone.</p>
            <p class="info">If you didn't request this, please ignore this email or contact our support team.</p>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return { html };
  }

  /**
   * Send OTP via SMS
   * @param {string} phone - Phone number
   * @param {string} purpose - Purpose of OTP
   * @param {Object} options - Additional options
   * @returns {Object} - Result
   */
//   async sendOTPSMS(phone, purpose = 'verification', options = {}) {
//     try {
//       const otpData = this.createOTP(phone, 'phone', purpose);
      
//       const message = `Your ${purpose} OTP is: ${otpData.otp}. Valid for ${this.otpConfig.expiresIn / 60} minutes. Do not share this code.`;

//       await sendSMS({
//         to: phone,
//         message,
//         ...options,
//       });

//       return {
//         success: true,
//         message: `OTP sent to your phone for ${purpose}`,
//         otpId: otpData.id,
//         expiresIn: this.otpConfig.expiresIn,
//       };
//     } catch (error) {
//       logger.error('Error sending OTP SMS:', error);
//       throw new Error('Failed to send OTP SMS');
//     }
//   }

  /**
   * Resend OTP
   * @param {string} identifier - Email or phone number
   * @param {string} type - 'email' or 'phone'
   * @param {string} purpose - Purpose of OTP
   * @returns {Object} - Result
   */
  async resendOTP(identifier, type = 'email', purpose = 'verification') {
    await Otp.deleteMany({ identifier, purpose });
    
    if (type === 'email') {
      return await this.sendOTPEmail(identifier, purpose);
    } else {
      // Placeholder for future SMS implementation
      // return await this.sendOTPSMS(identifier, purpose);
      throw new Error('SMS resend not implemented');
    }
  }

  /**
   * Get OTP status
   * @param {string} identifier - Email or phone number
   * @returns {Object} - OTP status
   */
  async getOTPStatus(identifier) {
    const otpRecord = await Otp.findOne({ identifier });
    if (!otpRecord) {
      return {
        exists: false,
        message: 'No active OTP found',
      };
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      return { exists: false, message: 'OTP expired' };
    }

    return {
      exists: true,
      attempts: otpRecord.attempts,
      maxAttempts: this.otpConfig.maxAttempts,
      expiresIn: Math.floor((new Date(otpRecord.expiresAt).getTime() - Date.now()) / 1000),
      purpose: otpRecord.purpose,
    };
  }
}

// Export singleton instance
const otpService = new OTPService();

module.exports = otpService;


/*   await Otp.deleteMany({ identifier, purpose });
    
    if (type === 'email') {
      return await this.sendOTPEmail(identifier, purpose);
    } else {
      // Placeholder for future SMS implementation
      // return await this.sendOTPSMS(identifier, purpose);
      throw new Error('SMS resend not implemented');
    }
  }

  async clearExpiredOTPs() {
    await Otp.deleteMany({ expiresAt: { $lt: new Date() } });
  }

  async getOTPStatus(identifier) {
    const otpRecord = await Otp.findOne({ identifier });
    if (!otpRecord) {
      return {
        exists: false,
        message: 'No active OTP found',
      };
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return { exists: false, message: 'OTP expired' };
    }

    return {
      exists: true,
      attempts: otpRecord.attempts,
      maxAttempts: this.otpConfig.maxAttempts,
      expiresIn: Math.floor((new Date(otpRecord.expiresAt).getTime() - Date.now()) / 1000),
      purpose: otpRecord.purpose,
    };
  }
}

// Export singleton instance
const otpService = new OTPService();

setInterval(() => {
  otpService.clearExpiredOTPs().catch(err => logger.error('Error clearing expired OTPs:', err));
}, 300000);
 */
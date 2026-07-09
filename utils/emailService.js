require("dotenv").config();
const nodemailer = require("nodemailer");
const logger = require("./logger");
const { mailConfig } = require("../config/mailConfig");

const getEmailTemplate = (template, data) => {
  const templates = {
    welcome: getWelcomeTemplate(data),
    verification: getVerificationTemplate(data),
    resetPassword: getResetPasswordTemplate(data),
    donationReceipt: getDonationReceiptTemplate(data),
    campaignApproved: getCampaignApprovedTemplate(data),
    campaignRejected: getCampaignRejectedTemplate(data),
    charityApproved: getCharityApprovedTemplate(data),
    charityRejected: getCharityRejectedTemplate(data),
    donationConfirmation: getDonationConfirmationTemplate(data),
    campaignUpdate: getCampaignUpdateTemplate(data),
    adminNotification: getAdminNotificationTemplate(data),
    contactUs: getContactUsTemplate(data),
    newsletter: getNewsletterTemplate(data),
    otpVerification: getOTPVerificationTemplate(data),
    passwordChanged: getPasswordChangedTemplate(data),
    accountDeactivated: getAccountDeactivatedTemplate(data),
    accountReactivated: getAccountReactivatedTemplate(data),
    newDonation: getNewDonationTemplate(data),
    campaignExpiring: getCampaignExpiringTemplate(data),
    monthlyReport: getMonthlyReportTemplate(data),
  };

  return templates[template] || getDefaultTemplate(data);
};


const getWelcomeTemplate = (data) => {
  const { name, role, loginUrl = `${process.env.FRONTEND_URL}/login` } = data;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .welcome { font-size: 24px; font-weight: 600; color: #1a1a2e; margin: 20px 0; }
          .message { color: #4a4a6a; line-height: 1.8; }
          .button { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .features { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; padding: 0; }
          .feature { flex: 1; min-width: 150px; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: center; }
          .feature-icon { font-size: 30px; display: block; margin-bottom: 5px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">❤️ CharityConnect</div>
          </div>
          <h2 class="welcome">Welcome ${name}! 🎉</h2>
          <p class="message">Thank you for joining CharityConnect as a <strong>${role}</strong>.</p>
          <p class="message">You're now part of a community dedicated to making a difference through charitable giving.</p>
          
          <div class="features">
            <div class="feature">
              <span class="feature-icon">🔍</span>
              <strong>Discover Causes</strong>
              <p style="font-size: 12px; color: #666;">Find campaigns that matter to you</p>
            </div>
            <div class="feature">
              <span class="feature-icon">💝</span>
              <strong>Make Impact</strong>
              <p style="font-size: 12px; color: #666;">Donate with confidence</p>
            </div>
            <div class="feature">
              <span class="feature-icon">📊</span>
              <strong>Track Progress</strong>
              <p style="font-size: 12px; color: #666;">See your impact in real-time</p>
            </div>
          </div>
          
          <p class="message">Here's what you can do next:</p>
          <ul>
            <li>Complete your profile</li>
            <li>Explore campaigns</li>
            <li>Start your giving journey</li>
          </ul>
          
          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Go to Dashboard</a>
          </div>
          
          <p class="message">If you have any questions, feel free to contact our support team.</p>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * OTP Verification Template
 */
const getOTPVerificationTemplate = (data) => {
  const { otp, purpose = 'verification', expiresIn = 5 } = data;
  
  const purposeMap = {
    verification: 'Verify your email address',
    login: 'Secure login verification',
    'reset-password': 'Password reset verification',
    donation: 'Donation confirmation',
  };

  const purposeText = purposeMap[purpose] || 'Verification';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .otp-box { background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; border: 2px dashed #667eea; }
          .otp-code { font-size: 48px; font-weight: 700; color: #667eea; letter-spacing: 12px; }
          .info { color: #4a4a6a; font-size: 14px; line-height: 1.6; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          .warning { background: #fff3cd; padding: 12px; border-radius: 8px; color: #856404; font-size: 13px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">❤️ CharityConnect</div>
          </div>
          <h2 style="color: #1a1a2e;">${purposeText}</h2>
          <p class="info">You've requested to ${purposeText.toLowerCase()}. Use the OTP below to complete your request:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          
          <p class="info">This OTP is valid for <strong>${expiresIn} minutes</strong>.</p>
          <p class="info">Do not share this code with anyone.</p>
          
          <div class="warning">
            ⚠️ If you didn't request this, please ignore this email or contact support immediately.
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Reset Password Template
 */
const getResetPasswordTemplate = (data) => {
  const { name, resetUrl } = data;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .button { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          .warning { background: #fff3cd; padding: 12px; border-radius: 8px; color: #856404; font-size: 13px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">❤️ CharityConnect</div>
          </div>
          <h2 style="color: #1a1a2e;">Reset Your Password</h2>
          <p>Hello ${name || 'User'},</p>
          <p>You requested to reset your password. Click the button below to set a new password.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <p>This link will expire in <strong>1 hour</strong>.</p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
          
          <div class="warning">
            ⚠️ If you didn't request this, please ignore this email or contact support.
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Donation Receipt Template
 */
const getDonationReceiptTemplate = (data) => {
  const { 
    name, 
    amount, 
    campaignName, 
    charityName, 
    donationId,
    transactionId,
    date,
    receiptUrl 
  } = data;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .receipt-box { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
          .receipt-row:last-child { border-bottom: none; }
          .amount { font-size: 32px; font-weight: 700; color: #667eea; }
          .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">❤️ CharityConnect</div>
            <h2 style="color: #1a1a2e;">Donation Receipt</h2>
          </div>
          
          <p>Dear ${name || 'Donor'},</p>
          <p>Thank you for your generous donation! Your support makes a real difference.</p>
          
          <div class="receipt-box">
            <div class="receipt-row">
              <span><strong>Donation Amount</strong></span>
              <span class="amount">$${amount}</span>
            </div>
            <div class="receipt-row">
              <span><strong>Campaign</strong></span>
              <span>${campaignName}</span>
            </div>
            <div class="receipt-row">
              <span><strong>Charity</strong></span>
              <span>${charityName}</span>
            </div>
            <div class="receipt-row">
              <span><strong>Donation ID</strong></span>
              <span>#${donationId}</span>
            </div>
            <div class="receipt-row">
              <span><strong>Transaction ID</strong></span>
              <span>${transactionId}</span>
            </div>
            <div class="receipt-row">
              <span><strong>Date</strong></span>
              <span>${new Date(date).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${receiptUrl}" class="button">View Full Receipt</a>
          </div>
          
          <p style="text-align: center; color: #4a4a6a; font-size: 14px;">
            This receipt can be used for tax purposes.
          </p>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Default Template (Fallback)
 */
const getDefaultTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .logo { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">❤️ CharityConnect</div>
          <h2>${data.subject || 'Notification'}</h2>
          <p>${data.message || 'You have a new notification from CharityConnect.'}</p>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};



// const sendEmail = async (options) => {
//   try {
//     const mailOptions = {
//       from: options.from || process.env.EMAIL_FROM || process.env.EMAIL_USER,
//       to: options.to,
//       subject: options.subject,
//       html: options.html,
//       text: options.text || options.html.replace(/<[^>]*>/g, ''),
//       attachments: options.attachments || [],
//     };

//     const info = await transporter.sendMail(mailOptions);
//     logger.info(`Email sent to ${options.to}: ${info.messageId}`);
//     return { success: true, messageId: info.messageId };
//   } catch (error) {
//     logger.error('Email send error:', error);
//     throw error;
//   }
// };


// ==================== EMAIL SENDING FUNCTIONS ====================

/**
 * Send email
 * @param {Object} options - Email options
 * @returns {Object} - Email sending result
 */
// const sendEmail = async (options) => {
//   // Check if email is configured
//   if (!sendMail) {
//     console.warn('⚠️ Email not sent - senMail not configured');
//     logger.warn('Email not sent - sendMail not configured');
    
//     // In development, log the email content instead of sending
//     if (process.env.NODE_ENV === 'development') {
//       console.log('📧 [DEV] Email would be sent:', {
//         to: options.to,
//         subject: options.subject,
//         html: options.html ? options.html.substring(0, 200) + '...' : undefined,
//       });
//       return { 
//         success: true, 
//         messageId: 'dev-mode',
//         devMode: true,
//         message: 'Email logged in development mode',
//       };
//     }
    
//     return { 
//       success: false, 
//       error: 'Email service not configured',
//     };
//   }

//   try {
//     const mailOptions = {
//       from: options.from || process.env.EMAIL_FROM || process.env.EMAIL_USER,
//       to: options.to,
//       subject: options.subject,
//       html: options.html,
//       text: options.text || options.html?.replace(/<[^>]*>/g, ''),
//       attachments: options.attachments || [],
//     };

//     const info = await mailConfig.sendMail(mailOptions);
//     console.log(`✅ Email sent to ${options.to}: ${info.messageId}`);
//     logger.info(`Email sent to ${options.to}: ${info.messageId}`);
//     return { success: true, messageId: info.messageId };
//   } catch (error) {
//     console.error('❌ Email send error:', error);
//     logger.error('Email send error:', error);
//     throw error;
//   }
// };

const sendTemplateEmail = async (to, template, data, subject = null) => {
  try {
    const html = getEmailTemplate(template, data);
    
    const subjects = {
      welcome: 'Welcome to CharityConnect 🎉',
      verification: 'Verify Your Email - CharityConnect',
      resetPassword: 'Reset Your Password - CharityConnect',
      donationReceipt: 'Your Donation Receipt - CharityConnect',
      campaignApproved: 'Campaign Approved - CharityConnect',
      campaignRejected: 'Campaign Update - CharityConnect',
      charityApproved: 'Charity Approved - CharityConnect',
      charityRejected: 'Charity Application Update - CharityConnect',
      donationConfirmation: 'Donation Confirmation - CharityConnect',
      campaignUpdate: 'Campaign Update - CharityConnect',
      adminNotification: 'Admin Notification - CharityConnect',
      contactUs: 'Thank You for Contacting Us - CharityConnect',
      newsletter: 'CharityConnect Newsletter',
      otpVerification: 'Your OTP Verification Code - CharityConnect',
      passwordChanged: 'Password Changed - CharityConnect',
      accountDeactivated: 'Account Deactivated - CharityConnect',
      accountReactivated: 'Account Reactivated - CharityConnect',
      newDonation: 'New Donation Received - CharityConnect',
      campaignExpiring: 'Campaign Expiring Soon - CharityConnect',
      monthlyReport: 'Your Monthly Impact Report - CharityConnect',
    };

    const emailSubject = subject || subjects[template] || 'Notification from CharityConnect';

    return await sendEmail({
      to,
      subject: emailSubject,
      html,
    });
  } catch (error) {
    logger.error('Template email send error:', error);
    throw error;
  }
};

// ==================== SPECIFIC EMAIL FUNCTIONS ====================

/**
 * Send welcome email
 */
const sendWelcomeEmail = async (to, name, role) => {
  return await sendTemplateEmail(to, 'welcome', { name, role });
};

/**
 * Send OTP verification email
 */
const sendOTPEmail = async (to, otp, purpose = 'verification', expiresIn = 5) => {
  return await sendTemplateEmail(to, 'otpVerification', { otp, purpose, expiresIn });
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (to, name, resetUrl) => {
  return await sendTemplateEmail(to, 'resetPassword', { name, resetUrl });
};

/**
 * Send donation receipt email
 */
const sendDonationReceiptEmail = async (to, data) => {
  return await sendTemplateEmail(to, 'donationReceipt', data);
};

const localTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (options) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  // Calling it directly on the object it was instantiated from keeps 'getSocket' happy
  return await localTransporter.sendMail(mailOptions);
};

module.exports = {
  sendEmail,
  sendTemplateEmail,
  sendWelcomeEmail,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendDonationReceiptEmail,
  getEmailTemplate,
};